package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/models/rerank"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
)

func (s *agentService) newTaskRunner(
	parentCfg *types.AgentConfig,
	chatModel chat.Chat,
	rerankModel rerank.Reranker,
	sessionID string,
) tools.TaskRunner {
	return func(ctx context.Context, description, prompt, subagentType string, maxTurns int) (string, error) {
		return s.runTaskSubagent(ctx, parentCfg, chatModel, rerankModel, sessionID, description, prompt, subagentType, maxTurns)
	}
}

func (s *agentService) runTaskSubagent(
	ctx context.Context,
	parentCfg *types.AgentConfig,
	chatModel chat.Chat,
	rerankModel rerank.Reranker,
	parentSessionID, description, prompt, subagentType string,
	maxTurns int,
) (string, error) {
	if parentCfg == nil {
		return "", fmt.Errorf("parent agent config is nil")
	}
	subCfg := *parentCfg
	subCfg.ParallelToolCalls = false
	subCfg.MCPSelectionMode = "none"
	subCfg.MCPServices = nil

	if maxTurns > 0 {
		subCfg.MaxIterations = maxTurns
	}
	if subCfg.MaxIterations <= 0 {
		subCfg.MaxIterations = 8
	}

	switch strings.TrimSpace(subagentType) {
	case "bash":
		subCfg.AllowedTools = []string{tools.ToolBash, tools.ToolFinalAnswer}
		subCfg.SkillsEnabled = false
		subCfg.SkillDirs = nil
		subCfg.WebSearchEnabled = false
	default:
		var allowed []string
		seen := make(map[string]struct{})
		for _, t := range parentCfg.AllowedTools {
			if t == tools.ToolTask {
				continue
			}
			if _, ok := seen[t]; ok {
				continue
			}
			seen[t] = struct{}{}
			allowed = append(allowed, t)
		}
		if len(allowed) == 0 {
			allowed = append([]string{}, tools.DefaultAllowedTools()...)
			filtered := allowed[:0]
			for _, t := range allowed {
				if t != tools.ToolTask {
					filtered = append(filtered, t)
				}
			}
			allowed = filtered
		}
		subCfg.AllowedTools = allowed
	}

	subSessionID := parentSessionID + "-task-" + uuid.New().String()
	discardBus := event.NewEventBus()

	logger.Infof(ctx, "[Subagent] Starting task %q session=%s type=%s maxTurns=%d",
		description, subSessionID, subagentType, subCfg.MaxIterations)

	engine, err := s.CreateAgentEngine(ctx, &subCfg, chatModel, rerankModel, discardBus, nil, subSessionID)
	if err != nil {
		return "", err
	}

	msgID := uuid.New().String()
	prefix := fmt.Sprintf("[Subtask: %s]\n\n", strings.TrimSpace(description))
	fullPrompt := prefix + prompt

	state, err := engine.Execute(ctx, subSessionID, msgID, fullPrompt, nil)
	if err != nil {
		return "", err
	}
	if state == nil {
		return "", fmt.Errorf("subagent returned nil state")
	}
	out := strings.TrimSpace(state.FinalAnswer)
	if out == "" && len(state.RoundSteps) > 0 {
		last := state.RoundSteps[len(state.RoundSteps)-1]
		out = strings.TrimSpace(last.Thought)
	}
	if out == "" {
		out = "(subagent completed with no textual answer)"
	}
	return out, nil
}
