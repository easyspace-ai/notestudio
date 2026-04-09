package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

// TaskRunner runs a delegated sub-agent and returns its final text result.
type TaskRunner func(ctx context.Context, description, prompt, subagentType string, maxTurns int) (string, error)

var taskSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "description": {"type": "string", "description": "Short label for the delegated task"},
    "prompt": {"type": "string", "description": "Instructions for the sub-agent"},
    "subagent_type": {"type": "string", "enum": ["general-purpose", "bash"], "description": "general-purpose or bash-only"},
    "max_turns": {"type": "integer", "description": "Max ReAct iterations for the sub-agent"}
  },
  "required": ["description", "prompt", "subagent_type"]
}`)

// TaskTool spawns a bounded sub-agent via TaskRunner (wired from agent service).
type TaskTool struct {
	run TaskRunner
}

func NewTaskTool(run TaskRunner) *TaskTool {
	if run == nil {
		return nil
	}
	return &TaskTool{run: run}
}

func (t *TaskTool) Name() string { return ToolTask }
func (t *TaskTool) Description() string {
	return "Spawn a sub-agent with a reduced tool set. subagent_type: general-purpose (most read/write tools) or bash (shell only)."
}
func (t *TaskTool) Parameters() json.RawMessage { return taskSchema }

func (t *TaskTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if t == nil || t.run == nil {
		return &types.ToolResult{Success: false, Error: "task runner not configured"}, nil
	}
	var in struct {
		Description  string `json:"description"`
		Prompt       string `json:"prompt"`
		SubagentType string `json:"subagent_type"`
		MaxTurns     int    `json:"max_turns"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	desc := strings.TrimSpace(in.Description)
	prompt := strings.TrimSpace(in.Prompt)
	subType := strings.TrimSpace(in.SubagentType)
	if desc == "" || prompt == "" {
		return &types.ToolResult{Success: false, Error: "description and prompt are required"}, nil
	}
	if subType == "" {
		subType = "general-purpose"
	}
	if subType != "general-purpose" && subType != "bash" {
		return &types.ToolResult{Success: false, Error: "subagent_type must be general-purpose or bash"}, nil
	}

	out, err := t.run(ctx, desc, prompt, subType, in.MaxTurns)
	if err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}
	return &types.ToolResult{Success: true, Output: out}, nil
}
