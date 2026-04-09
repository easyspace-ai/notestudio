package interfaces

import (
	"context"

	"github.com/Tencent/WeKnora/internal/types"
)

// ProjectRepository persists MetaNote projects.
type ProjectRepository interface {
	Create(ctx context.Context, p *types.Project) error
	GetByID(ctx context.Context, tenantID uint64, id string) (*types.Project, error)
	GetByUUID(ctx context.Context, tenantID uint64, uuid string) (*types.Project, error)
	ListByTenant(ctx context.Context, tenantID uint64, page *types.Pagination) ([]*types.Project, int64, error)
	Update(ctx context.Context, p *types.Project) error
	Delete(ctx context.Context, tenantID uint64, id string) error
}

// ProjectService manages projects and their linked knowledge bases.
type ProjectService interface {
	CreateProject(ctx context.Context, name string, description string) (*types.Project, error)
	GetProject(ctx context.Context, id string) (*types.Project, error)
	GetProjectByUUID(ctx context.Context, uuid string) (*types.Project, error)
	ListProjects(ctx context.Context, page *types.Pagination) ([]*types.Project, int64, error)
	UpdateProject(ctx context.Context, id string, name string) (*types.Project, error)
	DeleteProject(ctx context.Context, id string) error
}
