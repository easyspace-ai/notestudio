package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/workspace"
	"github.com/Tencent/WeKnora/internal/types"
)

var readFileSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "path": {"type": "string", "description": "File path (virtual /mnt/... or relative to workspace)"},
    "limit": {"type": "number", "description": "Maximum bytes to read"},
    "start_line": {"type": "integer", "description": "Starting line (1-based, inclusive)"},
    "end_line": {"type": "integer", "description": "Ending line (1-based, inclusive)"}
  },
  "required": ["path"]
}`)

var writeFileSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "content": {"type": "string"},
    "append": {"type": "boolean", "description": "Append instead of overwrite"}
  },
  "required": ["path", "content"]
}`)

var strReplaceSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "old_str": {"type": "string"},
    "new_str": {"type": "string"},
    "replace_all": {"type": "boolean"}
  },
  "required": ["path", "old_str", "new_str"]
}`)

var lsSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "path": {"type": "string", "description": "Directory path to list"}
  },
  "required": ["path"]
}`)

var globSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "pattern": {"type": "string", "description": "Glob pattern e.g. *.go"}
  },
  "required": ["pattern"]
}`)

func workspaceIdentityOK(ctx context.Context) bool {
	_, ok := workspace.TenantIDFromContext(ctx)
	if !ok {
		return false
	}
	return strings.TrimSpace(workspace.SessionIDFromContext(ctx)) != ""
}

func ensureSessionDirs(ctx context.Context) error {
	root := workspace.DefaultRoot()
	tid, ok := workspace.TenantIDFromContext(ctx)
	if !ok {
		return fmt.Errorf("tenant context missing")
	}
	sid := strings.TrimSpace(workspace.SessionIDFromContext(ctx))
	if sid == "" {
		return fmt.Errorf("session context missing")
	}
	return workspace.EnsureWorkspaceDirs(root, tid, sid)
}

// ReadFileTool reads files under virtual paths or workspace.
type ReadFileTool struct {
	maxOutputChars int // 0 = no per-tool cap beyond registry
}

func NewReadFileTool(maxOutputChars int) *ReadFileTool {
	return &ReadFileTool{maxOutputChars: maxOutputChars}
}

func (t *ReadFileTool) Name() string { return ToolReadFile }
func (t *ReadFileTool) Description() string {
	return "Read the contents of a file under /mnt/user-data, /mnt/skills, or workspace-relative paths."
}
func (t *ReadFileTool) Parameters() json.RawMessage {
	return readFileSchema
}

func (t *ReadFileTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "read_file requires tenant and session context"}, nil
	}
	var in struct {
		Path      string   `json:"path"`
		Limit     float64  `json:"limit"`
		StartLine *float64 `json:"start_line"`
		EndLine   *float64 `json:"end_line"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	path := strings.TrimSpace(in.Path)
	if path == "" {
		return &types.ToolResult{Success: false, Error: "path is required"}, nil
	}

	path = resolveReadableFilePath(ctx, path)
	resolved := workspace.ResolveFromContext(ctx, path)

	data, err := os.ReadFile(resolved)
	if err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("read failed: %v", err))}, nil
	}

	if in.Limit > 0 && int(in.Limit) < len(data) {
		data = data[:int(in.Limit)]
	}
	if in.StartLine != nil || in.EndLine != nil {
		var sp, ep *int
		if in.StartLine != nil {
			v := int(*in.StartLine)
			sp = &v
		}
		if in.EndLine != nil {
			v := int(*in.EndLine)
			ep = &v
		}
		start, end, ok := resolveLineRange(sp, ep)
		if ok {
			data = []byte(sliceContentLines(string(data), start, end))
		}
	}

	out := string(data)
	if t.maxOutputChars > 0 && len(out) > t.maxOutputChars {
		out = out[:t.maxOutputChars] + "\n... [truncated by read_file_output_max_chars]"
	}

	return &types.ToolResult{Success: true, Output: out}, nil
}

func resolveReadableFilePath(ctx context.Context, path string) string {
	path = strings.TrimSpace(path)
	resolved := workspace.ResolveFromContext(ctx, path)
	if !shouldPreferMarkdownCompanion(path) {
		return resolved
	}
	companion := strings.TrimSuffix(resolved, filepath.Ext(resolved)) + ".md"
	if st, err := os.Stat(companion); err == nil && st.Mode().IsRegular() {
		return companion
	}
	return resolved
}

func shouldPreferMarkdownCompanion(path string) bool {
	path = strings.TrimSpace(path)
	if !strings.HasPrefix(path, "/mnt/user-data/uploads/") {
		return false
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".pdf", ".ppt", ".pptx", ".xls", ".xlsx", ".doc", ".docx", ".csv", ".tsv", ".json", ".yaml", ".yml":
		return true
	default:
		return false
	}
}

func resolveLineRange(startPtr, endPtr *int) (int, int, bool) {
	if startPtr == nil && endPtr == nil {
		return 0, 0, false
	}
	start := 1
	if startPtr != nil {
		start = *startPtr
	}
	end := int(^uint(0) >> 1)
	if endPtr != nil {
		end = *endPtr
	}
	if start < 1 {
		start = 1
	}
	if end < start {
		end = start
	}
	return start, end, true
}

func sliceContentLines(content string, startLine, endLine int) string {
	lines := strings.Split(content, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	if startLine > len(lines) {
		return ""
	}
	startIdx := startLine - 1
	endIdx := endLine
	if endIdx > len(lines) {
		endIdx = len(lines)
	}
	if startIdx < 0 {
		startIdx = 0
	}
	if endIdx < startIdx {
		endIdx = startIdx
	}
	return strings.Join(lines[startIdx:endIdx], "\n")
}

// WriteFileTool writes files under the session workspace (not skills / not acp).
type WriteFileTool struct{}

func NewWriteFileTool() *WriteFileTool { return &WriteFileTool{} }

func (t *WriteFileTool) Name() string { return ToolWriteFile }
func (t *WriteFileTool) Description() string {
	return "Write content to a file under /mnt/user-data or workspace-relative paths. Skills and ACP paths are read-only."
}
func (t *WriteFileTool) Parameters() json.RawMessage {
	return writeFileSchema
}

func (t *WriteFileTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "write_file requires tenant and session context"}, nil
	}
	var in struct {
		Path    string `json:"path"`
		Content string `json:"content"`
		Append  bool   `json:"append"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	reqPath := strings.TrimSpace(in.Path)
	if reqPath == "" {
		return &types.ToolResult{Success: false, Error: "path is required"}, nil
	}

	resolved := workspace.ResolveFromContext(ctx, reqPath)
	if err := workspace.ValidateWritable(reqPath, resolved, workspace.SkillDirsFromContext(ctx)); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	if err := ensureSessionDirs(ctx); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("mkdir failed: %v", err))}, nil
	}

	if in.Append {
		f, err := os.OpenFile(resolved, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("write failed: %v", err))}, nil
		}
		defer f.Close()
		if _, err := f.WriteString(in.Content); err != nil {
			return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("write failed: %v", err))}, nil
		}
	} else if err := os.WriteFile(resolved, []byte(in.Content), 0o644); err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("write failed: %v", err))}, nil
	}

	return &types.ToolResult{
		Success: true,
		Output:  fmt.Sprintf("OK — wrote %s", reqPath),
		Data: map[string]interface{}{
			"path":      reqPath,
			"file_path": reqPath,
			"file_url":  reqPath,
		},
	}, nil
}

// StrReplaceTool replaces a unique substring in a file.
type StrReplaceTool struct{}

func NewStrReplaceTool() *StrReplaceTool { return &StrReplaceTool{} }

func (t *StrReplaceTool) Name() string { return ToolStrReplace }
func (t *StrReplaceTool) Description() string {
	return "Replace a string in a file (exactly once unless replace_all)."
}
func (t *StrReplaceTool) Parameters() json.RawMessage {
	return strReplaceSchema
}

func (t *StrReplaceTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "str_replace requires tenant and session context"}, nil
	}
	var in struct {
		Path       string `json:"path"`
		OldStr     string `json:"old_str"`
		NewStr     string `json:"new_str"`
		ReplaceAll bool   `json:"replace_all"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	reqPath := strings.TrimSpace(in.Path)
	if reqPath == "" {
		return &types.ToolResult{Success: false, Error: "path is required"}, nil
	}

	resolved := workspace.ResolveFromContext(ctx, reqPath)
	if err := workspace.ValidateWritable(reqPath, resolved, workspace.SkillDirsFromContext(ctx)); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	data, err := os.ReadFile(resolved)
	if err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("read failed: %v", err))}, nil
	}
	content := string(data)
	if !strings.Contains(content, in.OldStr) {
		return &types.ToolResult{Success: false, Error: "string to replace not found"}, nil
	}
	if !in.ReplaceAll && strings.Count(content, in.OldStr) != 1 {
		return &types.ToolResult{Success: false, Error: "string to replace must appear exactly once (or set replace_all)"}, nil
	}
	if in.ReplaceAll {
		content = strings.ReplaceAll(content, in.OldStr, in.NewStr)
	} else {
		content = strings.Replace(content, in.OldStr, in.NewStr, 1)
	}
	if err := os.WriteFile(resolved, []byte(content), 0o644); err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("write failed: %v", err))}, nil
	}
	return &types.ToolResult{
		Success: true,
		Output:  fmt.Sprintf("OK — updated %s", reqPath),
		Data: map[string]interface{}{
			"path":      reqPath,
			"file_path": reqPath,
			"file_url":  reqPath,
		},
	}, nil
}

// LsTool lists a directory (one-level tree expansion like metanote).
type LsTool struct{}

func NewLsTool() *LsTool { return &LsTool{} }

func (t *LsTool) Name() string        { return ToolLs }
func (t *LsTool) Description() string { return "List contents of a directory." }
func (t *LsTool) Parameters() json.RawMessage {
	return lsSchema
}

func (t *LsTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "ls requires tenant and session context"}, nil
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
	st, err := os.Stat(resolved)
	if err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("list failed: %v", err))}, nil
	}
	if !st.IsDir() {
		return &types.ToolResult{Success: false, Error: "path is not a directory"}, nil
	}
	entries, err := os.ReadDir(resolved)
	if err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("list failed: %v", err))}, nil
	}
	if len(entries) == 0 {
		return &types.ToolResult{Success: true, Output: "(empty)"}, nil
	}
	return &types.ToolResult{Success: true, Output: renderDirTree(resolved, entries, 0)}, nil
}

func renderDirTree(root string, entries []os.DirEntry, depth int) string {
	list := make([]os.DirEntry, len(entries))
	copy(list, entries)
	sort.Slice(list, func(i, j int) bool {
		di, dj := list[i].IsDir(), list[j].IsDir()
		if di != dj {
			return di
		}
		return list[i].Name() < list[j].Name()
	})
	var lines []string
	for _, entry := range list {
		name := entry.Name()
		if entry.IsDir() {
			name += "/"
		}
		lines = append(lines, strings.Repeat("  ", depth)+name)
		if !entry.IsDir() || depth >= 1 {
			continue
		}
		children, err := os.ReadDir(filepath.Join(root, entry.Name()))
		if err != nil || len(children) == 0 {
			continue
		}
		lines = append(lines, renderDirTree(filepath.Join(root, entry.Name()), children, depth+1))
	}
	return strings.Join(lines, "\n")
}

// GlobTool lists paths matching a glob pattern.
type GlobTool struct{}

func NewGlobTool() *GlobTool { return &GlobTool{} }

func (t *GlobTool) Name() string { return ToolGlob }
func (t *GlobTool) Description() string {
	return "List files matching a glob pattern under resolved paths."
}
func (t *GlobTool) Parameters() json.RawMessage {
	return globSchema
}

func (t *GlobTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "glob requires tenant and session context"}, nil
	}
	var in struct {
		Pattern string `json:"pattern"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	pattern := strings.TrimSpace(in.Pattern)
	if pattern == "" {
		return &types.ToolResult{Success: false, Error: "pattern is required"}, nil
	}
	resolved := workspace.ResolveFromContext(ctx, pattern)
	matches, err := filepath.Glob(resolved)
	if err != nil {
		return &types.ToolResult{Success: false, Error: workspace.MaskFromContext(ctx, fmt.Sprintf("glob failed: %v", err))}, nil
	}
	root := workspace.DefaultRoot()
	tid, _ := workspace.TenantIDFromContext(ctx)
	sid := workspace.SessionIDFromContext(ctx)
	skillDirs := workspace.SkillDirsFromContext(ctx)
	for i := range matches {
		matches[i] = workspace.MaskLocalPaths(root, tid, sid, skillDirs, matches[i])
	}
	b, _ := json.Marshal(matches)
	return &types.ToolResult{Success: true, Output: string(b)}, nil
}
