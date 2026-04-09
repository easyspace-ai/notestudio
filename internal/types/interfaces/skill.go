package interfaces

import (
	"context"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/types"
)

// SkillService defines the interface for skill business logic
type SkillService interface {
	// ListPreloadedSkills returns metadata for enabled skills (tenant/user API).
	ListPreloadedSkills(ctx context.Context) ([]*skills.SkillMetadata, error)

	// GetSkillByName retrieves a skill by its name (disabled skills are hidden).
	GetSkillByName(ctx context.Context, name string) (*skills.Skill, error)

	GetPreloadedDir() string

	// Platform admin
	ListSkillsForAdmin(ctx context.Context) ([]types.SkillAdminRow, error)
	GetSkillDetailForAdmin(ctx context.Context, name string) (*types.SkillAdminDetail, error)
	UpdateSkillFile(ctx context.Context, name, content string) error
	SetSkillEnabled(ctx context.Context, name string, enabled bool) error

	// ResolveAgentSkillAllowlist returns relative skill parent dirs and optional allowlist when some skills are disabled.
	ResolveAgentSkillAllowlist(ctx context.Context) (skillDirs []string, allowed []string, disableAll bool, err error)

	// FilterToEnabledSkillNames drops disabled skill names from a list (e.g. custom agent selection).
	FilterToEnabledSkillNames(ctx context.Context, names []string) ([]string, error)
}
