// Package output provides output adapter abstractions for decoupling streaming output
// from the core execution logic. It allows different output destinations (SSE, IM, etc.)
// to be plugged in without changing the core execution code.
package output

import (
	"context"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
)

// OutputEvent represents a unified output event that can be written to any OutputAdapter.
// It contains all the information needed to represent a single event in the output stream.
type OutputEvent struct {
	// ID is a unique identifier for this event
	ID string `json:"id"`

	// Type indicates the type of the event (thinking, tool_call, answer, etc.)
	Type types.ResponseType `json:"type"`

	// Content is the main content of the event (text chunk, tool description, etc.)
	Content string `json:"content"`

	// Done indicates whether this event is the final one for its type
	Done bool `json:"done"`

	// Timestamp when the event was created
	Timestamp time.Time `json:"timestamp"`

	// Data contains additional event-specific data (references, metadata, etc.)
	Data map[string]interface{} `json:"data,omitempty"`
}

// OutputAdapter defines the interface for writing output events.
// Implementations of this interface handle the specifics of different output destinations
// (SSE streams, IM channels, logs, etc.) while providing a consistent API.
type OutputAdapter interface {
	// Name returns the adapter name for logging and debugging purposes.
	Name() string

	// WriteEvent writes a single event to the output destination.
	// The event should be delivered in order with respect to other events written
	// through the same adapter instance.
	WriteEvent(ctx context.Context, sessionID, messageID string, evt OutputEvent) error

	// Flush flushes any buffered events to the output destination.
	// For adapters that buffer events, this ensures all pending events are sent.
	// For non-buffering adapters, this may be a no-op.
	Flush(ctx context.Context) error

	// Close cleans up any resources held by the adapter.
	// After Close is called, no further calls to WriteEvent or Flush should be made.
	Close(ctx context.Context) error
}
