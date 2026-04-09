package output

import (
	"context"

	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// StreamManagerAdapter is an OutputAdapter that wraps the existing StreamManager.
// It adapts the OutputEvent to the StreamEvent format expected by StreamManager.
type StreamManagerAdapter struct {
	streamMgr interfaces.StreamManager
}

// NewStreamManagerAdapter creates a new StreamManagerAdapter.
func NewStreamManagerAdapter(mgr interfaces.StreamManager) *StreamManagerAdapter {
	return &StreamManagerAdapter{
		streamMgr: mgr,
	}
}

// Name returns the adapter name.
func (a *StreamManagerAdapter) Name() string {
	return "stream_manager"
}

// WriteEvent writes an event to the underlying StreamManager.
// It converts OutputEvent to the StreamEvent format expected by StreamManager.
func (a *StreamManagerAdapter) WriteEvent(ctx context.Context, sessionID, messageID string, evt OutputEvent) error {
	streamEvent := interfaces.StreamEvent{
		ID:        evt.ID,
		Type:      evt.Type,
		Content:   evt.Content,
		Done:      evt.Done,
		Timestamp: evt.Timestamp,
		Data:      evt.Data,
	}
	return a.streamMgr.AppendEvent(ctx, sessionID, messageID, streamEvent)
}

// Flush is a no-op for StreamManagerAdapter since StreamManager doesn't buffer.
func (a *StreamManagerAdapter) Flush(ctx context.Context) error {
	return nil
}

// Close is a no-op for StreamManagerAdapter.
func (a *StreamManagerAdapter) Close(ctx context.Context) error {
	return nil
}
