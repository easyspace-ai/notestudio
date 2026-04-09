package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type skillOverridesFile struct {
	Disabled []string `json:"disabled"`
}

var skillOverridesMu sync.Mutex

func skillOverridesPath() string {
	if p := os.Getenv("WEKNORA_SKILL_OVERRIDES_PATH"); p != "" {
		return p
	}
	return filepath.Join("data", "skill_overrides.json")
}

func readDisabledSkillNamesUnlocked() (map[string]struct{}, error) {
	p := skillOverridesPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]struct{}{}, nil
		}
		return nil, err
	}
	var f skillOverridesFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	out := make(map[string]struct{})
	for _, n := range f.Disabled {
		if n != "" {
			out[n] = struct{}{}
		}
	}
	return out, nil
}

func readDisabledSkillNames() (map[string]struct{}, error) {
	skillOverridesMu.Lock()
	defer skillOverridesMu.Unlock()
	return readDisabledSkillNamesUnlocked()
}

func setSkillEnabledInOverrides(name string, enabled bool) error {
	skillOverridesMu.Lock()
	defer skillOverridesMu.Unlock()

	cur, err := readDisabledSkillNamesUnlocked()
	if err != nil {
		return err
	}
	if enabled {
		delete(cur, name)
	} else {
		cur[name] = struct{}{}
	}
	var names []string
	for n := range cur {
		names = append(names, n)
	}
	sort.Strings(names)
	p := skillOverridesPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	f := skillOverridesFile{Disabled: names}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}
