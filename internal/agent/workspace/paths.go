package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Virtual path prefixes (metanote-compatible).
const (
	VirtualUserData = "/mnt/user-data"
	VirtualSkills   = "/mnt/skills"
	VirtualACP      = "/mnt/acp-workspace"
)

// DefaultRoot returns the base directory for per-tenant/session workspaces.
// WEKNORA_AGENT_WORKSPACE_ROOT overrides; default is under os.TempDir().
func DefaultRoot() string {
	if v := strings.TrimSpace(os.Getenv("WEKNORA_AGENT_WORKSPACE_ROOT")); v != "" {
		return filepath.Clean(v)
	}
	return filepath.Join(os.TempDir(), "weknora-agent-workspace")
}

// UserDataDir is {root}/tenants/{tenantID}/sessions/{sessionID}/user-data
func UserDataDir(root string, tenantID uint64, sessionID string) string {
	root = strings.TrimSpace(root)
	sessionID = strings.TrimSpace(sessionID)
	if root == "" || sessionID == "" {
		return ""
	}
	return filepath.Join(root, "tenants", fmt.Sprintf("%d", tenantID), "sessions", sessionID, "user-data")
}

// WorkspaceDir is .../user-data/workspace (metanote-compatible: cwd for bash and relative paths).
func WorkspaceDir(root string, tenantID uint64, sessionID string) string {
	ud := UserDataDir(root, tenantID, sessionID)
	if ud == "" {
		return ""
	}
	return filepath.Join(ud, "workspace")
}

// ACPDir is the external-agent workspace (read-only for main agent writes).
func ACPDir(root string, tenantID uint64, sessionID string) string {
	root = strings.TrimSpace(root)
	sessionID = strings.TrimSpace(sessionID)
	if root == "" || sessionID == "" {
		return ""
	}
	// Sibling of user-data for clear separation from user uploads.
	return filepath.Join(root, "tenants", fmt.Sprintf("%d", tenantID), "sessions", sessionID, "acp-workspace")
}

// EnsureWorkspaceDirs creates user-data, workspace, and acp-workspace if missing.
func EnsureWorkspaceDirs(root string, tenantID uint64, sessionID string) error {
	for _, dir := range []string{
		UserDataDir(root, tenantID, sessionID),
		WorkspaceDir(root, tenantID, sessionID),
		ACPDir(root, tenantID, sessionID),
	} {
		if dir == "" {
			continue
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", dir, err)
		}
	}
	return nil
}

// PathWithinRoot returns true if candidate is equal to root or under it (after Clean).
func PathWithinRoot(root, candidate string) bool {
	root = filepath.Clean(strings.TrimSpace(root))
	candidate = filepath.Clean(strings.TrimSpace(candidate))
	if root == "" || candidate == "" {
		return false
	}
	if root == candidate {
		return true
	}
	sep := string(filepath.Separator)
	return strings.HasPrefix(candidate, root+sep)
}

// ResolveSkillsPath maps /mnt/skills/rel to the first existing file under skill parent dirs.
func ResolveSkillsPath(skillParents []string, virtualPath string) (string, bool) {
	virtualPath = strings.TrimSpace(virtualPath)
	if virtualPath == "" {
		return "", false
	}
	if virtualPath != VirtualSkills && !strings.HasPrefix(virtualPath, VirtualSkills+"/") {
		return "", false
	}
	rel := strings.TrimPrefix(virtualPath, VirtualSkills)
	rel = strings.TrimPrefix(rel, "/")
	rel = filepath.FromSlash(rel)
	rel = filepath.Clean(rel)
	if rel == "." {
		rel = ""
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	if len(skillParents) == 0 {
		return "", false
	}
	var fallback string
	for _, parent := range skillParents {
		p := strings.TrimSpace(parent)
		if p == "" {
			continue
		}
		p = filepath.Clean(p)
		candidate := p
		if rel != "" {
			candidate = filepath.Join(p, rel)
		}
		if fallback == "" {
			fallback = candidate
		}
		if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
			return candidate, true
		}
	}
	// If no file exists, return first candidate for clearer open errors (metanote-style).
	if rel != "" && fallback != "" {
		return fallback, true
	}
	return "", false
}

// ResolveVirtualPath maps a model-facing path to an absolute filesystem path.
// tenantID and sessionID come from context via caller; skillDirs lists skill parent directories.
func ResolveVirtualPath(root string, tenantID uint64, sessionID string, skillDirs []string, path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}

	switch {
	case strings.HasPrefix(path, VirtualUserData+"/") || path == VirtualUserData:
		base := UserDataDir(root, tenantID, sessionID)
		if base == "" {
			return path
		}
		suffix := strings.TrimPrefix(path, VirtualUserData)
		suffix = strings.TrimPrefix(suffix, "/")
		return filepath.Join(base, filepath.FromSlash(suffix))

	case path == VirtualSkills || strings.HasPrefix(path, VirtualSkills+"/"):
		if resolved, ok := ResolveSkillsPath(skillDirs, path); ok {
			return resolved
		}
		return path

	case path == VirtualACP || strings.HasPrefix(path, VirtualACP+"/"):
		base := ACPDir(root, tenantID, sessionID)
		if base == "" {
			return path
		}
		suffix := strings.TrimPrefix(path, VirtualACP)
		suffix = strings.TrimPrefix(suffix, "/")
		if suffix == "" {
			return base
		}
		return filepath.Join(base, filepath.FromSlash(suffix))

	case !filepath.IsAbs(path):
		ws := WorkspaceDir(root, tenantID, sessionID)
		if ws == "" {
			return path
		}
		return filepath.Join(ws, filepath.FromSlash(path))

	default:
		return path
	}
}

// ValidateWritable rejects writes to skills and acp-workspace virtual prefixes and resolved paths under skill roots.
func ValidateWritable(requestedVirtual, resolvedAbs string, skillDirs []string) error {
	req := strings.TrimSpace(requestedVirtual)
	if req == VirtualSkills || strings.HasPrefix(req, VirtualSkills+"/") {
		return fmt.Errorf("write access to skills path is not allowed: %s", req)
	}
	if req == VirtualACP || strings.HasPrefix(req, VirtualACP+"/") {
		return fmt.Errorf("write access to ACP workspace is not allowed: %s", req)
	}
	resolvedAbs = filepath.Clean(strings.TrimSpace(resolvedAbs))
	for _, parent := range skillDirs {
		p := filepath.Clean(strings.TrimSpace(parent))
		if p == "" {
			continue
		}
		if PathWithinRoot(p, resolvedAbs) {
			return fmt.Errorf("write access to skills path is not allowed")
		}
	}
	return nil
}
