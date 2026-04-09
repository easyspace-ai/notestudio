package tools

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/workspace"
	"github.com/Tencent/WeKnora/internal/types"
)

var viewImageSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "path": {"type": "string", "description": "Image file path (virtual or workspace-relative)"}
  },
  "required": ["path"]
}`)

// ViewImageTool loads an image from disk and returns a data URI for multimodal models.
type ViewImageTool struct{}

func NewViewImageTool() *ViewImageTool { return &ViewImageTool{} }

func (t *ViewImageTool) Name() string { return ToolViewImage }
func (t *ViewImageTool) Description() string {
	return "Load an image file into the tool result for vision models."
}
func (t *ViewImageTool) Parameters() json.RawMessage {
	return viewImageSchema
}

func (t *ViewImageTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "view_image requires tenant and session context"}, nil
	}
	var in struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	path := strings.TrimSpace(in.Path)
	if path == "" {
		return &types.ToolResult{Success: false, Error: "path is required"}, nil
	}
	resolved := workspace.ResolveFromContext(ctx, path)
	data, err := os.ReadFile(resolved)
	if err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("read failed: %v", err))}, nil
	}
	mime := mimeForImage(filepath.Ext(resolved))
	if mime == "" {
		return &types.ToolResult{Success: false, Error: "unsupported image type (use png, jpg, jpeg, gif, webp)"}, nil
	}
	uri := fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))
	return &types.ToolResult{
		Success: true,
		Output:  fmt.Sprintf("Image loaded from %s (%d bytes).", path, len(data)),
		Images:  []string{uri},
	}, nil
}

func mimeForImage(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return ""
	}
}
