package repository

import (
	"context"
	"errors"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
)

type projectRepository struct {
	db *gorm.DB
}

// NewProjectRepository creates a project repository.
func NewProjectRepository(db *gorm.DB) interfaces.ProjectRepository {
	return &projectRepository{db: db}
}

func (r *projectRepository) Create(ctx context.Context, p *types.Project) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *projectRepository) GetByID(ctx context.Context, tenantID uint64, id string) (*types.Project, error) {
	var p types.Project
	err := r.db.WithContext(ctx).Where("tenant_id = ? AND id = ?", tenantID, id).First(&p).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *projectRepository) GetByUUID(ctx context.Context, tenantID uint64, uuid string) (*types.Project, error) {
	var p types.Project
	err := r.db.WithContext(ctx).Where("tenant_id = ? AND uuid = ?", tenantID, uuid).First(&p).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *projectRepository) ListByTenant(ctx context.Context, tenantID uint64, page *types.Pagination) ([]*types.Project, int64, error) {
	var list []*types.Project
	var total int64
	q := r.db.WithContext(ctx).Model(&types.Project{}).Where("tenant_id = ?", tenantID)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("updated_at DESC").Offset(page.Offset()).Limit(page.Limit()).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

func (r *projectRepository) Update(ctx context.Context, p *types.Project) error {
	return r.db.WithContext(ctx).Model(&types.Project{}).
		Where("tenant_id = ? AND id = ?", p.TenantID, p.ID).
		Updates(map[string]interface{}{
			"name":       p.Name,
			"updated_at": time.Now(),
		}).Error
}

func (r *projectRepository) Delete(ctx context.Context, tenantID uint64, id string) error {
	return r.db.WithContext(ctx).Where("tenant_id = ? AND id = ?", tenantID, id).Delete(&types.Project{}).Error
}
