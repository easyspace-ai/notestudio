package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/Tencent/WeKnora/internal/agent/workspace"
	"github.com/Tencent/WeKnora/internal/types"
)

var bashAllowed = map[string]bool{
	"ls": true, "cat": true, "grep": true, "echo": true, "mkdir": true, "rm": true, "cp": true, "mv": true,
	"find": true, "head": true, "tail": true, "wc": true, "sort": true, "uniq": true, "cut": true, "awk": true,
	"sed": true, "diff": true, "patch": true, "tar": true, "zip": true, "unzip": true, "curl": true, "wget": true,
	"git": true, "go": true, "python": true, "python3": true, "node": true, "npm": true, "pnpm": true, "yarn": true,
}

var bashSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "command": {"type": "string", "description": "Shell command to run (first token must be allowlisted)"},
    "timeout": {"type": "number", "description": "Timeout in seconds (default 60)"}
  },
  "required": ["command"]
}`)

// BashTool runs a whitelisted shell command in the session workspace directory.
type BashTool struct {
	maxOutputChars int
}

func NewBashTool(maxOutputChars int) *BashTool {
	return &BashTool{maxOutputChars: maxOutputChars}
}

func (t *BashTool) Name() string { return ToolBash }
func (t *BashTool) Description() string {
	return "Execute shell commands in the session workspace. First token must be an allowlisted binary. Returns JSON with stdout, stderr, exit_code."
}
func (t *BashTool) Parameters() json.RawMessage { return bashSchema }

type bashOutput struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "bash requires tenant and session context"}, nil
	}
	var in struct {
		Command string  `json:"command"`
		Timeout float64 `json:"timeout"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	cmd := strings.TrimSpace(in.Command)
	if cmd == "" {
		return &types.ToolResult{Success: false, Error: "command is required"}, nil
	}
	parts := strings.Fields(cmd)
	if len(parts) > 0 {
		base := strings.ToLower(parts[0])
		if i := strings.LastIndex(base, "/"); i >= 0 {
			base = base[i+1:]
		}
		if !bashAllowed[base] {
			return &types.ToolResult{Success: false, Error: fmt.Sprintf("command %q is not allowlisted", base)}, nil
		}
	}

	timeout := 60 * time.Second
	if in.Timeout > 0 {
		timeout = time.Duration(in.Timeout) * time.Second
	}

	if err := ensureSessionDirs(ctx); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	root := workspace.DefaultRoot()
	tid, _ := workspace.TenantIDFromContext(ctx)
	sid := workspace.SessionIDFromContext(ctx)
	workDir := workspace.WorkspaceDir(root, tid, sid)

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	c := exec.CommandContext(runCtx, "sh", "-c", cmd)
	c.Dir = workDir
	if runtime.GOOS != "windows" {
		c.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}

	var stdout, stderr bytes.Buffer
	c.Stdout = &stdout
	c.Stderr = &stderr

	runErr := c.Run()
	exitCode := 0
	if runErr != nil {
		if ee, ok := runErr.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = -1
		}
	}

	out := bashOutput{
		Stdout:   workspace.MaskFromContext(ctx, stdout.String()),
		Stderr:   workspace.MaskFromContext(ctx, stderr.String()),
		ExitCode: exitCode,
	}
	if t.maxOutputChars > 0 {
		if len(out.Stdout) > t.maxOutputChars {
			out.Stdout = out.Stdout[:t.maxOutputChars] + "\n... [truncated]"
		}
		if len(out.Stderr) > t.maxOutputChars {
			out.Stderr = out.Stderr[:t.maxOutputChars] + "\n... [truncated]"
		}
	}
	b, _ := json.Marshal(out)
	return &types.ToolResult{Success: exitCode == 0 && runErr == nil, Output: string(b)}, nil
}
