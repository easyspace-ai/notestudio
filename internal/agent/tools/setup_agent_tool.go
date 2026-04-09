package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/workspace"
	"github.com/Tencent/WeKnora/internal/types"
	"gopkg.in/yaml.v3"
)

var setupAgentSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "soul": {"type": "string", "description": "Agent instructions / SOUL content"},
    "description": {"type": "string", "description": "One-line description"},
    "name": {"type": "string", "description": "Optional file name slug (alphanumeric)"}
  },
  "required": ["soul", "description"]
}`)

// SetupAgentTool writes a YAML draft under /mnt/user-data/agent-drafts for operators to import as CustomAgent.
type SetupAgentTool struct{}

func NewSetupAgentTool() *SetupAgentTool { return &SetupAgentTool{} }

func (t *SetupAgentTool) Name() string { return ToolSetupAgent }
func (t *SetupAgentTool) Description() string {
	return "Save a custom agent draft (soul + description) as YAML under /mnt/user-data/agent-drafts/. Import via admin UI."
}
func (t *SetupAgentTool) Parameters() json.RawMessage { return setupAgentSchema }

func (t *SetupAgentTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "setup_agent requires tenant and session context"}, nil
	}
	var in struct {
		Soul        string `json:"soul"`
		Description string `json:"description"`
		Name        string `json:"name"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	soul := strings.TrimSpace(in.Soul)
	desc := strings.TrimSpace(in.Description)
	if soul == "" || desc == "" {
		return &types.ToolResult{Success: false, Error: "soul and description are required"}, nil
	}
	slug := strings.TrimSpace(in.Name)
	if slug == "" {
		slug = "draft"
	}
	slug = sanitizeSlug(slug)

	if err := ensureSessionDirs(ctx); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	vpath := "/mnt/user-data/agent-drafts/" + slug + ".yaml"
	resolved := workspace.ResolveFromContext(ctx, vpath)
	if err := workspace.ValidateWritable(vpath, resolved, workspace.SkillDirsFromContext(ctx)); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	doc := map[string]interface{}{
		"description": desc,
		"soul":        soul,
		"kind":        "weknora_custom_agent_draft",
	}
	out, err := yaml.Marshal(doc)
	if err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}
	if err := os.WriteFile(resolved, out, 0o644); err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, err.Error())}, nil
	}
	return &types.ToolResult{Success: true, Output: fmt.Sprintf("Saved draft to %s", vpath)}, nil
}

func sanitizeSlug(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "draft"
	}
	return b.String()
}
