package service

import (
	"context"
	"encoding/json"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
)

type studioTaskHandler struct {
	studio interfaces.StudioService
}

// NewStudioTaskHandler adapts StudioService for Asynq / sync task execution.
func NewStudioTaskHandler(studio interfaces.StudioService) interfaces.TaskHandler {
	return &studioTaskHandler{studio: studio}
}

func (h *studioTaskHandler) Handle(ctx context.Context, t *asynq.Task) error {
	var payload types.StudioGeneratePayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return err
	}
	return h.studio.ProcessGenerateTask(ctx, &payload)
}
