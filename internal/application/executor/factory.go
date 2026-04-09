package executor

import (
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// ExecutorFactory creates appropriate Executor instances based on request context.
// It encapsulates the logic for selecting between RAG and Agent execution modes.
type ExecutorFactory struct {
	sessionService interfaces.SessionService
}

// NewExecutorFactory creates a new ExecutorFactory.
func NewExecutorFactory(svc interfaces.SessionService) *ExecutorFactory {
	return &ExecutorFactory{
		sessionService: svc,
	}
}

// CreateExecutor creates the appropriate Executor based on the request.
// It uses the following priority:
// 1. If CustomAgent is present and in Agent mode, returns AgentExecutor
// 2. Otherwise, returns RAGExecutor
func (f *ExecutorFactory) CreateExecutor(req *types.QARequest) Executor {
	if req.CustomAgent != nil && req.CustomAgent.IsAgentMode() {
		return NewAgentExecutor(f.sessionService)
	}
	return NewRAGExecutor(f.sessionService)
}

// IsAgentMode determines if the request should use Agent mode.
// This is a helper method that can be used by callers to determine
// the mode before creating the executor.
func IsAgentMode(req *types.QARequest) bool {
	return req.CustomAgent != nil && req.CustomAgent.IsAgentMode()
}
