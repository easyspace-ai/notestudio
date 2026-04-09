package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
)

type platformAdminRepository struct {
	db *gorm.DB
}

// NewPlatformAdminRepository creates the platform admin repository.
func NewPlatformAdminRepository(db *gorm.DB) interfaces.PlatformAdminRepository {
	return &platformAdminRepository{db: db}
}

func (r *platformAdminRepository) Create(ctx context.Context, a *types.Admin) error {
	return r.db.WithContext(ctx).Create(a).Error
}

func (r *platformAdminRepository) Update(ctx context.Context, a *types.Admin) error {
	return r.db.WithContext(ctx).Save(a).Error
}

func (r *platformAdminRepository) GetByEmail(ctx context.Context, email string) (*types.Admin, error) {
	var a types.Admin
	email = strings.TrimSpace(strings.ToLower(email))
	err := r.db.WithContext(ctx).Where("LOWER(email) = ?", email).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *platformAdminRepository) GetByID(ctx context.Context, id string) (*types.Admin, error) {
	var a types.Admin
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *platformAdminRepository) Count(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&types.Admin{}).Count(&n).Error
	return n, err
}
