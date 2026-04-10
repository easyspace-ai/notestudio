package types

// StudioQuickSkillsManifest is the JSON shape of skills/pubic/studio-quick-skills.json
// (Studio 对话快捷技能，与前端 WeKnora 侧栏一致).
type StudioQuickSkillsManifest struct {
	Version int                  `json:"version"`
	Items   []StudioQuickSkillItem `json:"items"`
}

// StudioQuickSkillItem is one chat quick-action row mapping to a Studio job kind.
type StudioQuickSkillItem struct {
	ID           string `json:"id"`
	SkillPath    string `json:"skillPath"`
	StudioKind   string `json:"studioKind"`
	DefaultTitle string `json:"defaultTitle"`
	Label        string `json:"label"`
	Description  string `json:"description,omitempty"`
	Icon         string `json:"icon"`
}
