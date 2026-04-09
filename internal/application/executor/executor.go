// Package executor provides unified execution abstraction for both RAG pipeline and Agent engine.
// It allows the handler layer to use a single entry point regardless of which execution strategy is needed.
package executor

import (
	"context"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/types"
)

// Executor defines the unified interface for both RAG pipeline and Agent execution.
// Implementations of this interface encapsulate the specific execution logic while
// providing a consistent API for the handler layer.
type Executor interface {
	// Name returns the executor name for logging, telemetry, and debugging purposes.
	Name() string

	// Execute runs the execution with the given request and event bus.
	// All streaming output, tool calls, and completion events are emitted through
	// the provided eventBus. The method blocks until execution completes or fails.
	Execute(ctx context.Context, req *types.QARequest, eventBus *event.EventBus) error
}
