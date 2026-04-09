package repository

import (
	"context"
	"errors"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
)

type studioJobRepository struct {
	db *gorm.DB
}

// NewStudioJobRepository creates a StudioJobRepository.
func NewStudioJobRepository(db *gorm.DB) interfaces.StudioJobRepository {
	return &studioJobRepository{db: db}
}

func (r *studioJobRepository) Create(ctx context.Context, j *types.StudioJob) error {
	return r.db.WithContext(ctx).Create(j).Error
}

func (r *studioJobRepository) GetByID(ctx context.Context, tenantID uint64, id string) (*types.StudioJob, error) {
	var j types.StudioJob
	err := r.db.WithContext(ctx).Where("tenant_id = ? AND id = ?", tenantID, id).First(&j).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &j, nil
}

func (r *studioJobRepository) ListByProject(ctx context.Context, tenantID uint64, projectID string, page *types.Pagination) ([]*types.StudioJob, int64, error) {
	var list []*types.StudioJob
	var total int64
	q := r.db.WithContext(ctx).Model(&types.StudioJob{}).Where("tenant_id = ? AND project_id = ?", tenantID, projectID)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("created_at DESC").Offset(page.Offset()).Limit(page.Limit()).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

func (r *studioJobRepository) Save(ctx context.Context, j *types.StudioJob) error {
	return r.db.WithContext(ctx).Save(j).Error
}
