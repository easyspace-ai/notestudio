package workspace

import (
	"context"
	"strings"
)

// Private context keys for agent tool execution (server-side only).
type ctxKey int

const (
	keySessionID ctxKey = iota
	keyTenantID
	keySkillDirs
)

// WithSessionID attaches the chat session ID for workspace path resolution.
func WithSessionID(ctx context.Context, sessionID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, keySessionID, sessionID)
}

// SessionIDFromContext returns the session ID or empty.
func SessionIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	s, _ := ctx.Value(keySessionID).(string)
	return s
}

// WithTenantID attaches the tenant ID used for workspace isolation.
func WithTenantID(ctx context.Context, tenantID uint64) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, keyTenantID, tenantID)
}

// TenantIDFromContext returns (id, true) if set.
func TenantIDFromContext(ctx context.Context) (uint64, bool) {
	if ctx == nil {
		return 0, false
	}
	v, ok := ctx.Value(keyTenantID).(uint64)
	return v, ok
}

// WithSkillDirs attaches skill parent directories for /mnt/skills resolution.
func WithSkillDirs(ctx context.Context, dirs []string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if len(dirs) == 0 {
		return ctx
	}
	cp := make([]string, len(dirs))
	copy(cp, dirs)
	return context.WithValue(ctx, keySkillDirs, cp)
}

// SkillDirsFromContext returns skill parent dirs (may be nil).
func SkillDirsFromContext(ctx context.Context) []string {
	if ctx == nil {
		return nil
	}
	v, _ := ctx.Value(keySkillDirs).([]string)
	return v
}

// ResolveFromContext maps a virtual or relative path using DefaultRoot and ctx (tenant, session, skill dirs).
// If tenant or session is missing, returns the original path unchanged (caller should validate).
func ResolveFromContext(ctx context.Context, path string) string {
	root := DefaultRoot()
	tid, tok := TenantIDFromContext(ctx)
	sid := strings.TrimSpace(SessionIDFromContext(ctx))
	if !tok || sid == "" {
		return strings.TrimSpace(path)
	}
	return ResolveVirtualPath(root, tid, sid, SkillDirsFromContext(ctx), path)
}

// MaskFromContext masks host paths in text for the current workspace identity in ctx.
func MaskFromContext(ctx context.Context, text string) string {
	root := DefaultRoot()
	tid, tok := TenantIDFromContext(ctx)
	sid := strings.TrimSpace(SessionIDFromContext(ctx))
	if !tok || sid == "" {
		return text
	}
	return MaskLocalPaths(root, tid, sid, SkillDirsFromContext(ctx), text)
}
