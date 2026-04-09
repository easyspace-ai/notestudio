# Agent workspace tools (Metanote-style)

## Overview

Optional tools align with virtual paths and per-session directories:

- `/mnt/user-data/...` → `{WEKNORA_AGENT_WORKSPACE_ROOT}/tenants/{tenantID}/sessions/{sessionID}/user-data/...`
- Relative paths → `.../user-data/workspace/...` (default cwd for `bash`)
- `/mnt/skills/...` → read-only resolution under configured `skill_dirs`
- `/mnt/acp-workspace/...` → external agent working directory (writes from the main agent are rejected by `write_file` / `str_replace`)

Default root: `os.TempDir()/weknora-agent-workspace` unless `WEKNORA_AGENT_WORKSPACE_ROOT` is set.

## Security

- Enable `read_file` / `write_file` / `bash` only for trusted tenants. `bash` uses a fixed allowlist of first-token commands.
- Prefer `execute_skill_script` with Docker sandbox for untrusted code.
- Paths must not escape session roots; `..` segments are rejected for skills.

## Configuration

| Mechanism | Purpose |
|-----------|---------|
| `WEKNORA_AGENT_WORKSPACE_ROOT` | Base directory for all session workspaces |
| `WEKNORA_ACP_AGENTS_JSON` | JSON map or `{"agents":{...}}` of named external commands for `invoke_acp_agent` |
| Custom agent `read_file_output_max_chars` | Extra cap on `read_file` output (before global `max_tool_output_chars`) |
| Custom agent `bash_output_max_chars` | Per-field truncation inside bash JSON stdout/stderr |

## Tools

| Name | Role |
|------|------|
| `read_file` | Read text; optional byte `limit`, `start_line` / `end_line` |
| `write_file` | Write or append under user-data / workspace |
| `str_replace` | In-place replace with uniqueness or `replace_all` |
| `ls` | Directory listing (shallow tree) |
| `glob` | Glob matches (paths masked in output) |
| `bash` | Allowlisted `sh -c` in workspace |
| `task` | Nested agent (`general-purpose` or `bash`), MCP disabled in sub-run |
| `view_image` | Data-URI image for vision models |
| `tool_search` | Keyword search over built-in tool metadata |
| `invoke_acp_agent` | Run configured external CLI in `acp-workspace` |
| `setup_agent` | Write YAML draft to `/mnt/user-data/agent-drafts/` |

## Context

`tenant` and `session` are injected from the request context in `runToolCall`; tools fail fast if either is missing.
