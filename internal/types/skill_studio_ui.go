package types

// SkillStudioUIEntry is stored in data/skill_studio_overrides.json (platform admin).
// It overrides scan-inferred labels / Studio kind for 魔棒 + Studio 侧栏统一展示。
type SkillStudioUIEntry struct {
	// DisplayLabel is shown in the magic wand menu and Studio tiles (别名/展示名).
	DisplayLabel string `json:"display_label,omitempty"`
	// DefaultTitle is the default job title when user starts generation from UI.
	DefaultTitle string `json:"default_title,omitempty"`
	// Icon is a frontend icon key: presentation, file-code, mic, brain, sparkles.
	Icon string `json:"icon,omitempty"`
	// StudioKind overrides inferred kind when set (html|slides|audio|mindmap).
	StudioKind string `json:"studio_kind,omitempty"`
	// ShowInStudioUI false hides this skill from studio-quick manifest entirely.
	ShowInStudioUI *bool `json:"show_in_studio_ui,omitempty"`
}
