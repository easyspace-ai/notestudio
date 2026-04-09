package executor

import (
	"context"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// RAGExecutor implements the Executor interface for RAG pipeline execution.
// It delegates to the existing SessionService.KnowledgeQA method.
type RAGExecutor struct {
	sessionService interfaces.SessionService
}

// NewRAGExecutor creates a new RAGExecutor.
func NewRAGExecutor(svc interfaces.SessionService) *RAGExecutor {
	return &RAGExecutor{
		sessionService: svc,
	}
}

// Name returns the executor name.
func (e *RAGExecutor) Name() string {
	return "rag"
}

// Execute runs the RAG pipeline execution.
func (e *RAGExecutor) Execute(ctx context.Context, req *types.QARequest, eventBus *event.EventBus) error {
	return e.sessionService.KnowledgeQA(ctx, req, eventBus)
}
