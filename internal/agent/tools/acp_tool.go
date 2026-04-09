package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/Tencent/WeKnora/internal/agent/workspace"
	"github.com/Tencent/WeKnora/internal/types"
)

// ACPAgentConfig describes one external agent command (env WEKNORA_ACP_AGENTS_JSON).
type ACPAgentConfig struct {
	Description string            `json:"description"`
	Command     string            `json:"command"`
	Args        []string          `json:"args"`
	Env         map[string]string `json:"env"`
}

var acpSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "agent": {"type": "string", "description": "Configured ACP agent name"},
    "prompt": {"type": "string", "description": "Task prompt for the external agent"},
    "timeout": {"type": "number", "description": "Timeout seconds (default 300)"}
  },
  "required": ["agent", "prompt"]
}`)

var (
	acpAgentsMu sync.RWMutex
	acpAgents   map[string]ACPAgentConfig
	acpParsed   bool
)

func loadACPAgentsFromEnv() map[string]ACPAgentConfig {
	acpAgentsMu.Lock()
	defer acpAgentsMu.Unlock()
	if acpParsed {
		return acpAgents
	}
	acpParsed = true
	raw := strings.TrimSpace(os.Getenv("WEKNORA_ACP_AGENTS_JSON"))
	if raw == "" {
		return nil
	}
	var wrapper struct {
		Agents map[string]ACPAgentConfig `json:"agents"`
	}
	if err := json.Unmarshal([]byte(raw), &wrapper); err == nil && len(wrapper.Agents) > 0 {
		acpAgents = wrapper.Agents
		return acpAgents
	}
	acpAgents = make(map[string]ACPAgentConfig)
	_ = json.Unmarshal([]byte(raw), &acpAgents)
	return acpAgents
}

// InvokeACPAgentTool runs configured external commands in the session acp-workspace (stdout only).
type InvokeACPAgentTool struct{}

func NewInvokeACPAgentTool() *InvokeACPAgentTool { return &InvokeACPAgentTool{} }

func (t *InvokeACPAgentTool) Name() string { return ToolInvokeACPAgent }
func (t *InvokeACPAgentTool) Description() string {
	return "Invoke a configured external agent (WEKNORA_ACP_AGENTS_JSON). Runs in /mnt/acp-workspace; main agent should treat that tree as read-only."
}
func (t *InvokeACPAgentTool) Parameters() json.RawMessage { return acpSchema }

func (t *InvokeACPAgentTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	if !workspaceIdentityOK(ctx) {
		return &types.ToolResult{Success: false, Error: "invoke_acp_agent requires tenant and session context"}, nil
	}
	agents := loadACPAgentsFromEnv()
	if len(agents) == 0 {
		return &types.ToolResult{Success: false, Error: "no ACP agents configured (set WEKNORA_ACP_AGENTS_JSON)"}, nil
	}

	var in struct {
		Agent   string  `json:"agent"`
		Prompt  string  `json:"prompt"`
		Timeout float64 `json:"timeout"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}
	name := strings.TrimSpace(in.Agent)
	prompt := strings.TrimSpace(in.Prompt)
	if name == "" || prompt == "" {
		return &types.ToolResult{Success: false, Error: "agent and prompt are required"}, nil
	}
	cfg, ok := agents[name]
	if !ok {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("unknown agent %q", name)}, nil
	}
	cmdPath := strings.TrimSpace(cfg.Command)
	if cmdPath == "" {
		return &types.ToolResult{Success: false, Error: "agent command is empty in config"}, nil
	}

	if err := ensureSessionDirs(ctx); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}
	root := workspace.DefaultRoot()
	tid, _ := workspace.TenantIDFromContext(ctx)
	sid := workspace.SessionIDFromContext(ctx)
	workDir := workspace.ACPDir(root, tid, sid)
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}

	timeout := 5 * time.Minute
	if in.Timeout > 0 {
		timeout = time.Duration(in.Timeout) * time.Second
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(runCtx, cmdPath, cfg.Args...)
	cmd.Dir = workDir
	env := os.Environ()
	for k, v := range cfg.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env
	cmd.Stdin = strings.NewReader(prompt)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	out := strings.TrimSpace(workspace.MaskFromContext(ctx, stdout.String()))
	if err != nil {
		msg := workspace.MaskFromContext(ctx, fmt.Sprintf("%v: %s", err, stderr.String()))
		return &types.ToolResult{Success: false, Error: msg}, nil
	}
	if out == "" {
		out = "(no stdout)"
	}
	return &types.ToolResult{Success: true, Output: out}, nil
}
