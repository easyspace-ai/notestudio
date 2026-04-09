package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

var toolSearchSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "query": {"type": "string", "description": "Keywords to match tool name or description"}
  },
  "required": ["query"]
}`)

// ToolSearchTool returns built-in tool metadata matching a query (helps large tool lists).
type ToolSearchTool struct{}

func NewToolSearchTool() *ToolSearchTool { return &ToolSearchTool{} }

func (t *ToolSearchTool) Name() string { return ToolToolSearch }
func (t *ToolSearchTool) Description() string {
	return "Search available built-in tools by name or description substring."
}
func (t *ToolSearchTool) Parameters() json.RawMessage {
	return toolSearchSchema
}

func (t *ToolSearchTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	var in struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	q := strings.ToLower(strings.TrimSpace(in.Query))
	if q == "" {
		return &types.ToolResult{Success: false, Error: "query is required"}, nil
	}
	var hits []AvailableTool
	for _, def := range AvailableToolDefinitions() {
		if strings.Contains(strings.ToLower(def.Name), q) || strings.Contains(strings.ToLower(def.Description), q) {
			hits = append(hits, def)
		}
	}
	b, _ := json.Marshal(hits)
	return &types.ToolResult{Success: true, Output: string(b)}, nil
}
