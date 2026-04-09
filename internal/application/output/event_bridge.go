package output

import (
	"context"
	"time"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/types"
)

// EventBridge subscribes to EventBus events and forwards them to an OutputAdapter.
// It acts as a bridge between the event system and the output system, converting
// EventBus events to OutputEvents and writing them through the adapter.
type EventBridge struct {
	eventBus  *event.EventBus
	adapter   OutputAdapter
	sessionID string
	messageID string
}

// NewEventBridge creates a new EventBridge.
func NewEventBridge(bus *event.EventBus, adapter OutputAdapter, sessionID, messageID string) *EventBridge {
	return &EventBridge{
		eventBus:  bus,
		adapter:   adapter,
		sessionID: sessionID,
		messageID: messageID,
	}
}

// Subscribe registers all event handlers to forward events to the OutputAdapter.
// This should be called before any events are emitted to ensure no events are missed.
func (b *EventBridge) Subscribe() {
	// Agent streaming events
	b.eventBus.On(event.EventAgentThought, b.handleThought)
	b.eventBus.On(event.EventAgentToolCall, b.handleToolCall)
	b.eventBus.On(event.EventAgentToolResult, b.handleToolResult)
	b.eventBus.On(event.EventAgentReferences, b.handleReferences)
	b.eventBus.On(event.EventAgentFinalAnswer, b.handleFinalAnswer)
	b.eventBus.On(event.EventAgentReflection, b.handleReflection)
	b.eventBus.On(event.EventAgentComplete, b.handleComplete)

	// Agent lifecycle events
	b.eventBus.On(event.EventAgentQuery, b.handleAgentQuery)

	// Error and session events
	b.eventBus.On(event.EventError, b.handleError)
	b.eventBus.On(event.EventSessionTitle, b.handleSessionTitle)

	// RAG pipeline events
	b.eventBus.On(event.EventChatStream, b.handleChatStream)
}

// handleThought processes agent thought events.
func (b *EventBridge) handleThought(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentThoughtData)
	if !ok {
		return nil
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeThinking,
		Content:   data.Content,
		Done:      data.Done,
		Timestamp: time.Now(),
	})
}

// handleToolCall processes agent tool call events.
func (b *EventBridge) handleToolCall(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentToolCallData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.Arguments != nil {
		eventData["arguments"] = data.Arguments
	}
	if data.Hint != "" {
		eventData["hint"] = data.Hint
	}
	if data.Iteration > 0 {
		eventData["iteration"] = data.Iteration
	}
	if data.ToolCallID != "" {
		eventData["tool_call_id"] = data.ToolCallID
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeToolCall,
		Content:   data.ToolName,
		Done:      true,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleToolResult processes agent tool result events.
func (b *EventBridge) handleToolResult(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentToolResultData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.Data != nil {
		eventData = data.Data
	}
	if data.ToolCallID != "" {
		eventData["tool_call_id"] = data.ToolCallID
	}
	if data.Error != "" {
		eventData["error"] = data.Error
	}
	eventData["success"] = data.Success
	if data.Duration > 0 {
		eventData["duration_ms"] = data.Duration
	}
	if data.Iteration > 0 {
		eventData["iteration"] = data.Iteration
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeToolResult,
		Content:   data.Output,
		Done:      true,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleReferences processes agent references events.
func (b *EventBridge) handleReferences(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentReferencesData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.References != nil {
		eventData["references"] = data.References
	}
	if data.Iteration > 0 {
		eventData["iteration"] = data.Iteration
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeReferences,
		Content:   "",
		Done:      true,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleFinalAnswer processes agent final answer events.
func (b *EventBridge) handleFinalAnswer(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentFinalAnswerData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.IsFallback {
		eventData["is_fallback"] = data.IsFallback
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeAnswer,
		Content:   data.Content,
		Done:      data.Done,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleReflection processes agent reflection events.
func (b *EventBridge) handleReflection(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentReflectionData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.ToolCallID != "" {
		eventData["tool_call_id"] = data.ToolCallID
	}
	if data.Iteration > 0 {
		eventData["iteration"] = data.Iteration
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeReflection,
		Content:   data.Content,
		Done:      data.Done,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleComplete processes agent complete events.
func (b *EventBridge) handleComplete(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentCompleteData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.TotalSteps > 0 {
		eventData["total_steps"] = data.TotalSteps
	}
	if data.KnowledgeRefs != nil {
		eventData["knowledge_refs"] = data.KnowledgeRefs
	}
	if data.AgentSteps != nil {
		eventData["agent_steps"] = data.AgentSteps
	}
	if data.TotalDurationMs > 0 {
		eventData["total_duration_ms"] = data.TotalDurationMs
	}
	if data.MessageID != "" {
		eventData["message_id"] = data.MessageID
	}
	if data.RequestID != "" {
		eventData["request_id"] = data.RequestID
	}
	if len(data.Extra) > 0 {
		for k, v := range data.Extra {
			eventData[k] = v
		}
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeComplete,
		Content:   data.FinalAnswer,
		Done:      true,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleAgentQuery processes agent query events.
func (b *EventBridge) handleAgentQuery(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.AgentQueryData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.RequestID != "" {
		eventData["request_id"] = data.RequestID
	}
	if len(data.Extra) > 0 {
		for k, v := range data.Extra {
			eventData[k] = v
		}
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeAgentQuery,
		Content:   data.Query,
		Done:      true,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleError processes error events.
func (b *EventBridge) handleError(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.ErrorData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.ErrorCode != "" {
		eventData["error_code"] = data.ErrorCode
	}
	if data.Stage != "" {
		eventData["stage"] = data.Stage
	}
	if data.SessionID != "" {
		eventData["session_id"] = data.SessionID
	}
	if data.Query != "" {
		eventData["query"] = data.Query
	}
	if len(data.Extra) > 0 {
		for k, v := range data.Extra {
			eventData[k] = v
		}
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeError,
		Content:   data.Error,
		Done:      true,
		Timestamp: time.Now(),
		Data:      eventData,
	})
}

// handleSessionTitle processes session title events.
func (b *EventBridge) handleSessionTitle(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.SessionTitleData)
	if !ok {
		return nil
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeSessionTitle,
		Content:   data.Title,
		Done:      true,
		Timestamp: time.Now(),
	})
}

// handleChatStream processes RAG chat stream events.
func (b *EventBridge) handleChatStream(ctx context.Context, evt event.Event) error {
	data, ok := evt.Data.(event.ChatData)
	if !ok {
		return nil
	}
	eventData := make(map[string]interface{})
	if data.ModelID != "" {
		eventData["model_id"] = data.ModelID
	}
	if data.TokenCount > 0 {
		eventData["token_count"] = data.TokenCount
	}
	if data.Duration > 0 {
		eventData["duration_ms"] = data.Duration
	}
	if len(data.Extra) > 0 {
		for k, v := range data.Extra {
			eventData[k] = v
		}
	}
	return b.adapter.WriteEvent(ctx, b.sessionID, b.messageID, OutputEvent{
		ID:        evt.ID,
		Type:      types.ResponseTypeAnswer,
		Content:   data.StreamChunk,
		Done:      false, // Chat stream events are individual chunks, not done
		Timestamp: time.Now(),
		Data:      eventData,
	})
}
