package types

// SkillAdminRow is one skill row for platform admin management UI.
type SkillAdminRow struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"` // preloaded | pubic
	Enabled     bool   `json:"enabled"`
}

// SkillAdminDetail includes full SKILL.md body for view/edit in admin.
type SkillAdminDetail struct {
	SkillAdminRow
	Content string `json:"content"`
	RelPath string `json:"rel_path"`
}
