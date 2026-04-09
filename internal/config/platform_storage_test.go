package config

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

func TestEffectiveStorageProvider_PlatformDefault(t *testing.T) {
	cfg := &Config{
		PlatformStorageEngine: &types.StorageEngineConfig{
			DefaultProvider: "local",
			Local:           &types.LocalEngineConfig{},
		},
	}
	kb := &types.KnowledgeBase{}
	kb.SetStorageProvider("minio") // ignored when platform active
	if got := EffectiveStorageProvider(cfg, kb, nil); got != "local" {
		t.Fatalf("EffectiveStorageProvider = %q, want local", got)
	}
}

func TestEffectiveStorageProvider_KBWhenPlatformInactive(t *testing.T) {
	cfg := &Config{}
	kb := &types.KnowledgeBase{}
	kb.SetStorageProvider("minio")
	if got := EffectiveStorageProvider(cfg, kb, nil); got != "minio" {
		t.Fatalf("got %q, want minio", got)
	}
}

func TestEffectiveStorageProvider_TenantWhenNoKB(t *testing.T) {
	cfg := &Config{}
	tenant := &types.Tenant{
		StorageEngineConfig: &types.StorageEngineConfig{DefaultProvider: "cos"},
	}
	if got := EffectiveStorageProvider(cfg, nil, tenant); got != "cos" {
		t.Fatalf("got %q, want cos", got)
	}
}

func TestEffectiveStorageProvider_DefaultLocal(t *testing.T) {
	if got := EffectiveStorageProvider(&Config{}, &types.KnowledgeBase{}, &types.Tenant{}); got != "local" {
		t.Fatalf("EffectiveStorageProvider = %q, want local", got)
	}
}

func TestEffectiveStorageEngine_PlatformFirst(t *testing.T) {
	sec := &types.StorageEngineConfig{DefaultProvider: "local", Local: &types.LocalEngineConfig{}}
	cfg := &Config{PlatformStorageEngine: sec}
	tenant := &types.Tenant{StorageEngineConfig: &types.StorageEngineConfig{DefaultProvider: "cos"}}
	if got := EffectiveStorageEngine(cfg, tenant); got != sec {
		t.Fatal("expected platform storage engine pointer")
	}
}

func TestEnsureDefaultPlatformLocalStorage(t *testing.T) {
	cfg := &Config{}
	ensureDefaultPlatformLocalStorage(cfg)
	if cfg.PlatformStorageEngine == nil || cfg.PlatformStorageEngine.DefaultProvider != "local" {
		t.Fatalf("expected default local, got %#v", cfg.PlatformStorageEngine)
	}
	if cfg.PlatformStorageEngine.Local == nil {
		t.Fatal("expected LocalEngineConfig")
	}
}

func TestEnsureDefaultPlatformLocalStorage_Idempotent(t *testing.T) {
	cfg := &Config{
		PlatformStorageEngine: &types.StorageEngineConfig{
			DefaultProvider: "minio",
			MinIO:           &types.MinIOEngineConfig{Mode: "docker"},
		},
	}
	ensureDefaultPlatformLocalStorage(cfg)
	if cfg.PlatformStorageEngine.DefaultProvider != "minio" {
		t.Fatalf("should not overwrite existing provider: %#v", cfg.PlatformStorageEngine)
	}
}

func TestMergePlatformStorageEngineFromYAMLText(t *testing.T) {
	yaml := `
server:
  port: 8080
platform_storage_engine:
  default_provider: local
  local:
    path_prefix: "p"
`
	cfg := &Config{}
	mergePlatformStorageEngineFromYAMLText(cfg, yaml)
	if cfg.PlatformStorageEngine == nil || cfg.PlatformStorageEngine.DefaultProvider != "local" {
		t.Fatalf("merge failed: %#v", cfg.PlatformStorageEngine)
	}
	if cfg.PlatformStorageEngine.Local == nil || cfg.PlatformStorageEngine.Local.PathPrefix != "p" {
		t.Fatalf("local block: %#v", cfg.PlatformStorageEngine.Local)
	}
}

func TestPlatformStorageEngineActive(t *testing.T) {
	var c *Config
	if c.PlatformStorageEngineActive() {
		t.Fatal("nil config should be inactive")
	}
	c = &Config{}
	if c.PlatformStorageEngineActive() {
		t.Fatal("empty PlatformStorageEngine should be inactive")
	}
	c.PlatformStorageEngine = &types.StorageEngineConfig{DefaultProvider: "  local  "}
	if !c.PlatformStorageEngineActive() {
		t.Fatal("should be active")
	}
}
