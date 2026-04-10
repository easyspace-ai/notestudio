package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/Tencent/WeKnora/internal/types"
)

type skillStudioOverridesFile struct {
	Version int                                    `json:"version"`
	ByName  map[string]types.SkillStudioUIEntry `json:"by_name"`
}

var skillStudioOverridesMu sync.Mutex

func skillStudioOverridesPath() string {
	if p := os.Getenv("WEKNORA_SKILL_STUDIO_OVERRIDES_PATH"); p != "" {
		return p
	}
	return filepath.Join("data", "skill_studio_overrides.json")
}

func readSkillStudioOverridesUnlocked() (map[string]types.SkillStudioUIEntry, error) {
	p := skillStudioOverridesPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]types.SkillStudioUIEntry{}, nil
		}
		return nil, err
	}
	var f skillStudioOverridesFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.ByName == nil {
		return map[string]types.SkillStudioUIEntry{}, nil
	}
	return f.ByName, nil
}

func readSkillStudioOverrides() (map[string]types.SkillStudioUIEntry, error) {
	skillStudioOverridesMu.Lock()
	defer skillStudioOverridesMu.Unlock()
	return readSkillStudioOverridesUnlocked()
}

func writeSkillStudioOverrides(byName map[string]types.SkillStudioUIEntry) error {
	skillStudioOverridesMu.Lock()
	defer skillStudioOverridesMu.Unlock()
	p := skillStudioOverridesPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	names := make([]string, 0, len(byName))
	for n := range byName {
		if n != "" {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	ordered := make(map[string]types.SkillStudioUIEntry, len(names))
	for _, n := range names {
		ordered[n] = byName[n]
	}
	f := skillStudioOverridesFile{Version: 1, ByName: ordered}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(p, data, 0644)
}

// mergeSkillStudioUIEntry applies non-zero / non-nil fields from patch onto base.
func mergeSkillStudioUIEntry(base types.SkillStudioUIEntry, patch types.SkillStudioUIEntry) types.SkillStudioUIEntry {
	out := base
	if patch.DisplayLabel != "" {
		out.DisplayLabel = patch.DisplayLabel
	}
	if patch.DefaultTitle != "" {
		out.DefaultTitle = patch.DefaultTitle
	}
	if patch.Icon != "" {
		out.Icon = patch.Icon
	}
	if patch.StudioKind != "" {
		out.StudioKind = patch.StudioKind
	}
	if patch.ShowInStudioUI != nil {
		out.ShowInStudioUI = patch.ShowInStudioUI
	}
	return out
}

// ApplySkillStudioUIOverridesToItems merges admin UI overrides and drops entries marked hidden.
func ApplySkillStudioUIOverridesToItems(items []types.StudioQuickSkillItem) ([]types.StudioQuickSkillItem, error) {
	ov, err := readSkillStudioOverrides()
	if err != nil {
		return nil, err
	}
	if len(ov) == 0 {
		return items, nil
	}
	var out []types.StudioQuickSkillItem
	for _, it := range items {
		e, ok := ov[it.ID]
		if ok && e.ShowInStudioUI != nil && !*e.ShowInStudioUI {
			continue
		}
		if !ok {
			out = append(out, it)
			continue
		}
		clone := it
		if e.DisplayLabel != "" {
			clone.Label = e.DisplayLabel
		}
		if e.DefaultTitle != "" {
			clone.DefaultTitle = e.DefaultTitle
		}
		if e.Icon != "" {
			clone.Icon = e.Icon
		}
		if e.StudioKind != "" && validStudioQuickKind(e.StudioKind) {
			clone.StudioKind = e.StudioKind
		}
		out = append(out, clone)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Label < out[j].Label
	})
	return out, nil
}
