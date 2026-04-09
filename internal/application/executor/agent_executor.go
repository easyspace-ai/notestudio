package executor

import (
	"context"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// AgentExecutor implements the Executor interface for Agent engine execution.
// It delegates to the existing SessionService.AgentQA method.
type AgentExecutor struct {
	sessionService interfaces.SessionService
}

// NewAgentExecutor creates a new AgentExecutor.
func NewAgentExecutor(svc interfaces.SessionService) *AgentExecutor {
	return &AgentExecutor{
		sessionService: svc,
	}
}

// Name returns the executor name.
func (e *AgentExecutor) Name() string {
	return "agent"
}

// Execute runs the Agent engine execution.
func (e *AgentExecutor) Execute(ctx context.Context, req *types.QARequest, eventBus *event.EventBus) error {
	return e.sessionService.AgentQA(ctx, req, eventBus)
}
