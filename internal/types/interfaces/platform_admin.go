package interfaces

import (
	"context"

	"github.com/Tencent/WeKnora/internal/types"
)

// PlatformAdminAuthService issues and validates platform admin JWTs (SaaS console).
type PlatformAdminAuthService interface {
	EnsureDefaultAdmin(ctx context.Context) error
	Login(ctx context.Context, email, password string) (accessToken string, admin *types.Admin, err error)
	ValidateAdminToken(ctx context.Context, token string) (*types.Admin, error)
}

// PlatformAdminRepository persists platform operators.
type PlatformAdminRepository interface {
	Create(ctx context.Context, a *types.Admin) error
	Update(ctx context.Context, a *types.Admin) error
	GetByEmail(ctx context.Context, email string) (*types.Admin, error)
	GetByID(ctx context.Context, id string) (*types.Admin, error)
	Count(ctx context.Context) (int64, error)
}
