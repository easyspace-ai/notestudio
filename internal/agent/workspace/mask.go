package workspace

import (
	"path/filepath"
	"sort"
	"strings"
)

type pathMapping struct {
	actual  string
	virtual string
}

// LocalPathMappings builds ordered (longest actual first) mappings for masking.
func LocalPathMappings(root string, tenantID uint64, sessionID string, skillDirs []string) []pathMapping {
	var out []pathMapping
	if ud := UserDataDir(root, tenantID, sessionID); ud != "" {
		out = append(out, pathMapping{actual: filepath.Clean(ud), virtual: VirtualUserData})
	}
	if acp := ACPDir(root, tenantID, sessionID); acp != "" {
		out = append(out, pathMapping{actual: filepath.Clean(acp), virtual: VirtualACP})
	}
	for _, parent := range skillDirs {
		p := filepath.Clean(strings.TrimSpace(parent))
		if p == "" {
			continue
		}
		out = append(out, pathMapping{actual: p, virtual: VirtualSkills})
	}
	sort.Slice(out, func(i, j int) bool {
		return len(out[i].actual) > len(out[j].actual)
	})
	return out
}

// MaskLocalPaths replaces absolute host paths in text with virtual prefixes.
func MaskLocalPaths(root string, tenantID uint64, sessionID string, skillDirs []string, text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}
	mappings := LocalPathMappings(root, tenantID, sessionID, skillDirs)
	if len(mappings) == 0 {
		return text
	}
	masked := text
	for _, m := range mappings {
		if m.actual == "" || m.virtual == "" {
			continue
		}
		masked = strings.ReplaceAll(masked, m.actual, m.virtual)
		slash := filepath.ToSlash(m.actual)
		if slash != m.actual {
			masked = strings.ReplaceAll(masked, slash, m.virtual)
		}
	}
	return masked
}
