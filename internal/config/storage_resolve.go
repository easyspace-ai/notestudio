package config

import (
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

// PlatformStorageEngineActive is true when platform_storage_engine.default_provider is set in application config.
// When active, all knowledge bases use this config for object storage (credentials + default engine), ignoring per-KB provider.
func (c *Config) PlatformStorageEngineActive() bool {
	if c == nil || c.PlatformStorageEngine == nil {
		return false
	}
	return strings.TrimSpace(c.PlatformStorageEngine.DefaultProvider) != ""
}

// EffectiveStorageEngine returns platform storage config when active, otherwise the tenant's StorageEngineConfig.
func EffectiveStorageEngine(cfg *Config, tenant *types.Tenant) *types.StorageEngineConfig {
	if cfg != nil && cfg.PlatformStorageEngineActive() {
		return cfg.PlatformStorageEngine
	}
	if tenant != nil {
		return tenant.StorageEngineConfig
	}
	return nil
}

// EffectiveStorageProvider returns the provider string for file I/O.
// When platform storage is active, returns platform default_provider only (ignores KB-level selection).
// Otherwise: KB provider, then tenant default_provider.
func EffectiveStorageProvider(cfg *Config, kb *types.KnowledgeBase, tenant *types.Tenant) string {
	if cfg != nil && cfg.PlatformStorageEngineActive() {
		return strings.ToLower(strings.TrimSpace(cfg.PlatformStorageEngine.DefaultProvider))
	}
	if kb != nil {
		if p := kb.GetStorageProvider(); p != "" {
			return p
		}
	}
	if tenant != nil && tenant.StorageEngineConfig != nil {
		if p := strings.TrimSpace(tenant.StorageEngineConfig.DefaultProvider); p != "" {
			return strings.ToLower(p)
		}
	}
	// Default when nothing in config / KB / tenant (LoadConfig also sets platform default_provider=local).
	return "local"
}
