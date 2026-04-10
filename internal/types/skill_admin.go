package types

// SkillAdminRow is one skill row for platform admin management UI.
type SkillAdminRow struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"` // preloaded | pubic
	Enabled     bool   `json:"enabled"`
	// StudioUI is optional admin overrides for Studio / 魔棒 (from skill_studio_overrides.json).
	StudioUI *SkillStudioUIEntry `json:"studio_ui,omitempty"`
}

// SkillAdminDetail includes full SKILL.md body for view/edit in admin.
type SkillAdminDetail struct {
	SkillAdminRow
	Content string `json:"content"`
	RelPath string `json:"rel_path"`
}
