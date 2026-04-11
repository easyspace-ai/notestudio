import type { StudioMaterial, StudioMaterialKind } from "@/api/chatclaw";
import type { WeKnoraAgentStep, WeKnoraMessage } from "@/api/weknora/types";

/** Same tags as `WeKnoraChatDock` / backend chain-of-thought wrappers. */
const REDACTED_THINKING_OPEN = "<redacted_thinking>";
const REDACTED_THINKING_CLOSE = "</redacted_thinking>";

function assistantBody(content: string): string {
  const s = content ?? "";
  if (!s.includes(REDACTED_THINKING_OPEN)) return s.trim();
  const firstOpen = s.indexOf(REDACTED_THINKING_OPEN);
  const lastClose = s.lastIndexOf(REDACTED_THINKING_CLOSE);
  const openEnd = firstOpen + REDACTED_THINKING_OPEN.length;
  if (lastClose === -1 || lastClose < firstOpen) {
    const prefix = s.slice(0, firstOpen).trim();
    return prefix;
  }
  const after = s.slice(lastClose + REDACTED_THINKING_CLOSE.length).trim();
  const prefix = s.slice(0, firstOpen).trim();
  return [prefix, after].filter(Boolean).join("\n\n").trim();
}

const ARTIFACT_EXT = /\.(html?|md|markdown|pptx?|pdf)$/i;

/** Extract workspace / storage paths mentioned in plain tool output or assistant text. */
export function extractPathStringsFromText(text: string): string[] {
  if (!text?.trim()) return [];
  const out: string[] = [];
  const r1 = /\b(\.\/[a-zA-Z0-9_.\-/]+\.(?:html?|md|markdown|pptx?|pdf))\b/g;
  let m: RegExpExecArray | null;
  while ((m = r1.exec(text)) !== null) out.push(m[1]!);
  const r2 = /\b(local:\/\/[^\s`"'<>\]]+)\b/gi;
  while ((m = r2.exec(text)) !== null) out.push(m[1]!);
  const r3 = /\b(\/mnt\/[a-zA-Z0-9_./\-]+\.(?:html?|md|markdown|pptx?|pdf))\b/g;
  while ((m = r3.exec(text)) !== null) out.push(m[1]!);
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))];
}

function kindFromPath(p: string): StudioMaterialKind {
  const lower = p.toLowerCase();
  if (/\.(html?|htm)$/.test(lower)) return "html";
  if (/\.(pptx?)$/.test(lower)) return "slides";
  if (/\.(md|markdown)$/.test(lower)) return "report";
  if (/\.pdf$/i.test(lower)) return "report";
  return "report";
}

function titleFromPath(p: string): string {
  const seg = p.split(/[/\\]/).pop() ?? p;
  return seg.replace(/\.[^.]+$/, "") || seg || "生成文件";
}

function stableId(prefix: string, key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(h).toString(36)}`;
}

/** Collect provider paths from tool result metadata (merged into SSE `data`). */
export function collectPathsFromToolData(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return;
      if (/^(local|minio|s3|tos):\/\//i.test(t)) {
        out.push(t);
        return;
      }
      if (ARTIFACT_EXT.test(t) && (t.includes("/") || t.includes("\\"))) {
        out.push(t);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      for (const k of Object.keys(v as object)) {
        if (/path|file|artifact|url|output/i.test(k)) {
          visit((v as Record<string, unknown>)[k]);
        }
      }
    }
  };

  for (const key of ["file_path", "file_url", "artifact_path", "saved_path", "output_file", "path", "url"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) visit(v.trim());
  }
  if (data.artifacts && typeof data.artifacts === "object") {
    visit(data.artifacts);
  }
  if (data.output && typeof data.output === "object") {
    visit(data.output);
  }
  if (typeof data.output === "string" && data.output.trim()) {
    for (const p of extractPathStringsFromText(data.output)) {
      out.push(p);
    }
  }

  return [...new Set(out)];
}

export type WeKnoraSessionArtifact = {
  id: string;
  title: string;
  kind: StudioMaterialKind;
  created_at: string;
  updated_at: string;
  subtitle: string;
  payload: Record<string, unknown>;
};

/** Build sidebar rows from a single tool_result `data` object (SSE metadata). */
function workspacePayloadFlags(p: string): Record<string, unknown> {
  const t = p.trim();
  const ws = t.startsWith("./") || t.startsWith("/mnt/");
  return ws ? { _weknora_workspace: true } : {};
}

export function artifactsFromToolResultData(data: Record<string, unknown>): WeKnoraSessionArtifact[] {
  const paths = collectPathsFromToolData(data);
  const now = new Date().toISOString();
  return paths.map((p) => ({
    id: stableId("path", p),
    title: titleFromPath(p),
    kind: kindFromPath(p),
    created_at: now,
    updated_at: now,
    subtitle: "来自工具输出",
    payload: { file_path: p, file_url: p, _weknora_from: "tool_stream", ...workspacePayloadFlags(p) },
  }));
}

function fenceArtifactsFromText(body: string, messageId: string): WeKnoraSessionArtifact[] {
  const out: WeKnoraSessionArtifact[] = [];
  const re = /```\s*([a-z0-9_-]+)?\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(body)) !== null) {
    const lang = (m[1] ?? "").toLowerCase();
    const inner = (m[2] ?? "").trim();
    if (inner.length < 12) continue;
    if (inner.length > 600_000) continue;

    let kind: StudioMaterialKind = "report";
    let title = `片段 ${idx + 1}`;
    if (lang === "html" || lang === "htm") {
      kind = "html";
      title = `HTML · ${messageId.slice(0, 8)}-${idx + 1}`;
    } else if (lang === "md" || lang === "markdown") {
      kind = "report";
      title = `Markdown · ${messageId.slice(0, 8)}-${idx + 1}`;
    } else {
      const looksHtml = /^<!DOCTYPE\s+/i.test(inner) || /^<html[\s>]/i.test(inner.trim());
      if (looksHtml) {
        kind = "html";
        title = `HTML · ${messageId.slice(0, 8)}-${idx + 1}`;
      } else {
        continue;
      }
    }

    const now = new Date().toISOString();
    const id = stableId("fence", `${messageId}:${idx}:${inner.slice(0, 64)}`);
    const payload: Record<string, unknown> =
      kind === "html"
        ? { srcDoc: inner, file_name: `${title.replace(/\s+/g, "-")}.html`, _weknora_from: "fence" }
        : { markdown: inner, file_name: `${title.replace(/\s+/g, "-")}.md`, _weknora_from: "fence" };

    out.push({
      id,
      title,
      kind,
      created_at: now,
      updated_at: now,
      subtitle: "来自助手回复",
      payload,
    });
    idx += 1;
  }
  return out;
}

function artifactsFromAgentSteps(steps: WeKnoraAgentStep[]): WeKnoraSessionArtifact[] {
  const out: WeKnoraSessionArtifact[] = [];
  for (const s of steps) {
    for (const tc of s.tool_calls ?? []) {
      const d = tc.result?.data;
      if (!d || typeof d !== "object") continue;
      const paths = collectPathsFromToolData(d as Record<string, unknown>);
      for (const p of paths) {
        const now = new Date().toISOString();
        const id = stableId("path", p);
        out.push({
          id,
          title: titleFromPath(p),
          kind: kindFromPath(p),
          created_at: now,
          updated_at: now,
          subtitle: "来自工具输出",
          payload: { file_path: p, file_url: p, _weknora_from: "tool", ...workspacePayloadFlags(p) },
        });
      }
    }
  }
  return out;
}

function artifactsFromPlainTextPaths(body: string, sessionId: string): WeKnoraSessionArtifact[] {
  const paths = extractPathStringsFromText(body);
  const now = new Date().toISOString();
  const out: WeKnoraSessionArtifact[] = [];
  for (const p of paths) {
    const id = stableId("path", p);
    out.push({
      id,
      title: titleFromPath(p),
      kind: kindFromPath(p),
      created_at: now,
      updated_at: now,
      subtitle: "来自助手回复",
      payload: {
        file_path: p,
        file_url: p,
        _weknora_from: "text",
        _weknora_session_id: sessionId,
        ...workspacePayloadFlags(p),
      },
    });
  }
  return out;
}

/** Derive sidebar artifacts from persisted messages (assistant content + agent_steps). */
export function computeArtifactsFromMessages(messages: WeKnoraMessage[] | undefined): WeKnoraSessionArtifact[] {
  if (!messages?.length) return [];
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const map = new Map<string, WeKnoraSessionArtifact>();

  for (const m of sorted) {
    if (m.role !== "assistant" || !m.id) continue;
    if (Array.isArray(m.agent_steps) && m.agent_steps.length > 0) {
      for (const a of artifactsFromAgentSteps(m.agent_steps)) {
        map.set(a.id, a);
      }
    }
    const body = assistantBody(m.content ?? "");
    if (body.trim()) {
      for (const a of fenceArtifactsFromText(body, m.id)) {
        map.set(a.id, a);
      }
      const sid = (m.session_id ?? "").trim();
      if (sid) {
        for (const a of artifactsFromPlainTextPaths(body, sid)) {
          map.set(a.id, a);
        }
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export function mergeArtifactLists(
  a: WeKnoraSessionArtifact[],
  b: WeKnoraSessionArtifact[],
): WeKnoraSessionArtifact[] {
  const map = new Map<string, WeKnoraSessionArtifact>();
  for (const x of [...a, ...b]) {
    map.set(x.id, x);
  }
  return [...map.values()].sort(
    (x, y) => new Date(y.updated_at).getTime() - new Date(x.updated_at).getTime(),
  );
}

/** Map session artifact → Studio panel row (ChatClaw `StudioMaterial` shape). */
export function weknoraSessionArtifactToMaterial(
  a: WeKnoraSessionArtifact,
  projectId: string,
  sessionId?: string | null,
): StudioMaterial {
  const sid = (sessionId ?? "").trim() || (typeof a.payload._weknora_session_id === "string" ? a.payload._weknora_session_id : "");
  return {
    id: a.id,
    created_at: a.created_at,
    updated_at: a.updated_at,
    project_id: projectId,
    kind: a.kind,
    title: a.title,
    status: "ready",
    subtitle: a.subtitle,
    payload: {
      ...a.payload,
      _weknora_chat_artifact: true,
      ...(sid ? { _weknora_session_id: sid } : {}),
    },
  };
}
