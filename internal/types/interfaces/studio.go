package interfaces

import (
	"context"

	"github.com/Tencent/WeKnora/internal/types"
)

// StudioJobRepository persists studio_jobs rows.
type StudioJobRepository interface {
	Create(ctx context.Context, j *types.StudioJob) error
	GetByID(ctx context.Context, tenantID uint64, id string) (*types.StudioJob, error)
	ListByProject(ctx context.Context, tenantID uint64, projectID string, page *types.Pagination) ([]*types.StudioJob, int64, error)
	Save(ctx context.Context, j *types.StudioJob) error
}

// StudioService creates Studio jobs and enqueues async work.
type StudioService interface {
	CreateJob(ctx context.Context, projectUUID, kind, title string, sessionID *string) (*types.StudioJob, error)
	GetJob(ctx context.Context, id string) (*types.StudioJob, error)
	ListJobs(ctx context.Context, projectUUID string, page *types.Pagination) ([]*types.StudioJob, int64, error)
	// ProcessGenerateTask runs inside Asynq / sync worker (not HTTP).
	ProcessGenerateTask(ctx context.Context, payload *types.StudioGeneratePayload) error
}
