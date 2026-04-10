import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  ArrowUp,
  Brain,
  ChevronDown,
  ChevronRight,
  FileCode,
  Globe,
  Image as ImageIcon,
  AtSign,
  Sparkles,
  Square,
  Lightbulb,
  Wand2,
} from "lucide-react";
import { streamAgentChat } from "@/api/weknora/agentChatStream";
import { continueAgentChatStream } from "@/api/weknora/continueStream";
import * as messagesApi from "@/api/weknora/messages";
import * as agentsApi from "@/api/weknora/agents";
import * as knowledgeApi from "@/api/weknora/knowledge";
import { fetchStudioQuickSkills } from "@/api/weknora/studio";
import type { WeKnoraAgentStep, WeKnoraMessage, WeKnoraToolResult, WeKnoraStudioQuickSkillItem } from "@/api/weknora/types";
import type { WeKnoraAgent } from "@/api/weknora/agents";
import type { WeKnoraStreamResponse } from "@/api/weknora/types";
import { AgentCanvasFrame } from "@/components/weknora/agent-canvas-frame";
import { WeKnoraAssistantMarkdown, buildKnowledgeFileIndex } from "@/core/streamdown";
import { WeKnoraKbCitationProvider } from "@/components/project/weknora-kb-citation-context";
import { studioQuickIconTone, studioQuickSkillIcon } from "@/lib/studioQuickIcons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Backend and chat models wrap chain-of-thought in these tags (see Go remote_api / chat_completion_stream). */
const REDACTED_THINKING_OPEN = "<redacted_thinking>";
const REDACTED_THINKING_CLOSE = "</redacted_thinking>";

function splitRedactedThinking(raw: string): {
  thinking: string | null;
  content: string;
  thinkingIncomplete: boolean;
} {
  const s = raw;
  if (!s.includes(REDACTED_THINKING_OPEN)) {
    return { thinking: null, content: s, thinkingIncomplete: false };
  }
  const firstOpen = s.indexOf(REDACTED_THINKING_OPEN);
  const lastClose = s.lastIndexOf(REDACTED_THINKING_CLOSE);
  const openEnd = firstOpen + REDACTED_THINKING_OPEN.length;
  if (lastClose === -1 || lastClose < firstOpen) {
    const inner = s.slice(openEnd).trim();
    const prefix = s.slice(0, firstOpen).trim();
    return { thinking: inner || null, content: prefix, thinkingIncomplete: true };
  }
  const inner = s.slice(openEnd, lastClose).trim();
  const after = s.slice(lastClose + REDACTED_THINKING_CLOSE.length).trim();
  const prefix = s.slice(0, firstOpen).trim();
  const content = [prefix, after].filter(Boolean).join("\n\n").trim();
  return { thinking: inner || null, content, thinkingIncomplete: false };
}

type StreamEventItem = {
  id: string;
  type: "thinking" | "tool_call" | "tool_result" | "other";
  title: string;
  content?: string;
  pending?: boolean;
  success?: boolean;
  toolCallID?: string;
};

type FileTreeInfo = {
  root?: string;
  entries: string[];
};

function buildStreamEventID(e: WeKnoraStreamResponse): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const eventID = typeof d.event_id === "string" ? d.event_id : undefined;
  const toolCallID = typeof d.tool_call_id === "string" ? d.tool_call_id : undefined;
  return `${e.response_type}:${eventID ?? toolCallID ?? crypto.randomUUID()}`;
}

function extractToolName(e: WeKnoraStreamResponse): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const n = d.tool_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return "tool";
}

/** Tool payloads that echo React Flow graph JSON can be shown on the ai-elements Canvas. */
function tryParseAgentGraph(raw: string): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const o = JSON.parse(raw) as { nodes?: unknown; edges?: unknown };
    if (!o || typeof o !== "object") return null;
    if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
    return { nodes: o.nodes as Node[], edges: o.edges as Edge[] };
  } catch {
    return null;
  }
}

function tryParseFileTree(raw: string): FileTreeInfo | null {
  const text = raw.trim();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  // Plain text fallbacks from bash-like tools: keep likely file/dir lines.
  const pathLike = lines.filter((l) =>
    /^(\.\/|\/|~\/|[A-Za-z0-9_.-]+\/|[A-Za-z0-9_.-]+\.[A-Za-z0-9]+|[├└│─])/.test(l),
  );

  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const entries = Array.isArray(j.entries)
      ? j.entries.map(String)
      : Array.isArray(j.files)
        ? j.files.map(String)
        : Array.isArray(j.paths)
          ? j.paths.map(String)
          : [];
    const root =
      typeof j.path === "string"
        ? j.path
        : typeof j.root === "string"
          ? j.root
          : undefined;
    if (entries.length > 0) return { root, entries: entries.slice(0, 120) };
  } catch {
    // no-op; try text fallback below
  }

  if (pathLike.length > 0) {
    return { entries: pathLike.slice(0, 120) };
  }
  return null;
}

/** Reuse stream-time rendering for tool output (graph / file tree / markdown). */
function StreamLikeToolOutput({ content, pending }: { content: string; pending?: boolean }) {
  const graph = tryParseAgentGraph(content);
  if (graph && (graph.nodes.length > 0 || graph.edges.length > 0)) {
    return (
      <AgentCanvasFrame
        nodes={graph.nodes}
        edges={graph.edges}
        className="mt-1 min-h-[240px] border-slate-200"
      />
    );
  }
  const fileTree = tryParseFileTree(content);
  if (fileTree && fileTree.entries.length > 0) {
    return (
      <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        {fileTree.root ? (
          <div className="mb-2 text-xs text-slate-500">路径：{fileTree.root}</div>
        ) : null}
        <div className="max-h-52 overflow-auto text-xs leading-6 text-slate-700">
          {fileTree.entries.map((entry, idx) => (
            <div key={`${idx}-${entry}`} className="truncate font-mono">
              {entry}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <WeKnoraAssistantMarkdown streaming={!!pending} className="text-inherit">
      {content}
    </WeKnoraAssistantMarkdown>
  );
}

function getToolIconAndLabel(name?: string) {
  const n = name ?? "";
  if (n === "search_knowledge" || n === "knowledge_search") return { tone: "emerald", label: "知识库检索" };
  if (n === "grep_chunks") return { tone: "emerald", label: "片段匹配" };
  if (n === "web_search") return { tone: "blue", label: "网络搜索" };
  if (n === "web_fetch") return { tone: "blue", label: "网页获取" };
  if (n === "todo_write") return { tone: "amber", label: "更新计划" };
  if (n === "thinking") return { tone: "emerald", label: "深度思考" };
  if (n === "get_document_info" || n === "list_knowledge_chunks") return { tone: "slate", label: "文档信息" };
  if (n.startsWith("mcp_")) return { tone: "violet", label: n.slice(4).replace(/_/g, " ") };
  return { tone: "slate", label: n || "工具调用" };
}

function getToolSummary(name?: string, args?: Record<string, unknown>, result?: WeKnoraToolResult | null): string | null {
  const data = result?.data;
  if (name === "search_knowledge" || name === "knowledge_search") {
    const count = (data as any)?.count ?? (data as any)?.results?.length ?? 0;
    if (count) return `找到 ${count} 条结果`;
  }
  if (name === "grep_chunks") {
    const total = (data as any)?.total_matches ?? 0;
    if (total) return `匹配 ${total} 处内容`;
  }
  if (name === "web_search") {
    const count = (data as any)?.count ?? (data as any)?.results?.length ?? 0;
    if (count) return `检索到 ${count} 条网页结果`;
  }
  if (name === "todo_write") {
    const steps = (data as any)?.steps ?? [];
    const done = steps.filter((s: any) => s.status === "completed").length;
    const ing = steps.filter((s: any) => s.status === "in_progress").length;
    if (steps.length) return `计划进度 ${done}/${steps.length}${ing ? `（进行中 ${ing}）` : ""}`;
  }
  if (name === "get_document_info") {
    const title = (data as any)?.title ?? (data as any)?.documents?.[0]?.title;
    if (title) return `文档：${title}`;
  }
  const q = args?.query ?? (args?.queries as any)?.[0];
  if (typeof q === "string" && q.trim()) return `查询：${q.trim()}`;
  return null;
}

type TimelineRowData = {
  id: string;
  type: "thinking" | "tool_call" | "tool_result" | "other";
  title: string;
  content?: string;
  pending?: boolean;
  success?: boolean;
  args?: string;
  meta?: { tone: string; label: string };
};

function TimelineItemCard({ item, streaming }: { item: TimelineRowData; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const isPending = !!item.pending;

  useEffect(() => {
    if (streaming && isPending) setOpen(true);
  }, [streaming, isPending]);

  const isThinking = item.type === "thinking";
  const iconNode = isThinking ? (
    <Lightbulb className="h-3.5 w-3.5 text-emerald-600" />
  ) : item.type === "other" ? (
    <Sparkles className="h-3.5 w-3.5 text-slate-500" />
  ) : (
    <FileCode className="h-3.5 w-3.5 text-slate-500" />
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              isThinking ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600",
            )}
          >
            {iconNode}
          </span>
          <span className="truncate text-sm text-slate-700">{item.title}</span>
        </div>
        {isPending ? (
          <span className="ml-2 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        ) : (
          <ChevronRight
            className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
          />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 py-3 text-sm text-slate-700">
          {item.args ? (
            <pre className="mb-2 max-h-32 overflow-auto rounded-md bg-slate-50 p-2 text-xs leading-snug text-slate-600">
              {item.args}
            </pre>
          ) : null}
          {item.content ? (
            <div className="min-w-0 text-inherit">
              {isThinking ? (
                <WeKnoraAssistantMarkdown streaming={!!streaming && isPending}>{item.content}</WeKnoraAssistantMarkdown>
              ) : (
                <StreamLikeToolOutput content={item.content} pending={!!streaming && isPending} />
              )}
            </div>
          ) : item.args ? null : (
            <span className="text-xs text-slate-400">暂无详情</span>
          )}
        </div>
      )}
    </div>
  );
}

function AgentTimeline({
  rows,
  title,
  streaming,
}: {
  rows: TimelineRowData[];
  title?: string;
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  if (!rows.length) return null;

  return (
    <div className="mb-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex w-full items-center justify-between px-1 text-xs font-medium text-slate-500 hover:text-slate-600"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5" />
          <span>{title || `工具执行过程`}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !expanded && "-rotate-90")} />
      </button>
      {expanded && (
        <div className="relative space-y-2 pl-4 before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-slate-200">
          {rows.map((row) => (
            <div key={row.id} className="relative">
              <span
                className={cn(
                  "absolute top-3 -left-[13px] h-2.5 w-2.5 rounded-full border",
                  row.type === "thinking"
                    ? "border-emerald-300 bg-emerald-200"
                    : row.success === false
                      ? "border-red-300 bg-red-200"
                      : "border-slate-300 bg-slate-200",
                )}
              />
              <TimelineItemCard item={row} streaming={streaming} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders DB-backed `agent_steps` so refresh restores 思考 + 工具轨迹（与流式过程同构）。 */
function PersistedAgentStepsTimeline({ steps }: { steps: WeKnoraAgentStep[] }) {
  if (!steps.length) return null;
  const rows: TimelineRowData[] = [];
  steps.forEach((step, si) => {
    if (step.thought?.trim()) {
      rows.push({
        id: `thought-${si}`,
        type: "thinking",
        title: "已深度思考",
        content: step.thought.trim(),
      });
    }
    (step.tool_calls ?? []).forEach((tc, ti) => {
      const meta = getToolIconAndLabel(tc.name);
      const summary = getToolSummary(tc.name, tc.args, tc.result);
      const out = tc.result?.output?.trim() ?? "";
      const err = tc.result?.error?.trim() ?? "";
      const success = tc.result?.success !== false && !err;
      rows.push({
        id: `tc-${si}-${ti}`,
        type: "tool_call",
        title: `${meta.label}: ${tc.name?.trim() || "tool"}${summary ? ` · ${summary}` : ""}`,
        args: tc.args && Object.keys(tc.args).length > 0 ? JSON.stringify(tc.args, null, 2) : undefined,
        content: out || err || undefined,
        success,
        meta,
      });
    });
  });
  return <AgentTimeline rows={rows} title={`已完成 ${rows.length} 个步骤`} />;
}

// Thinking card styled after frontend333 deepThink.vue (emerald theme, no auto-collapse).
function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(!!isStreaming);
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-emerald-200/70 bg-emerald-50/40 shadow-sm">
      <button
        type="button"
        disabled={!!isStreaming}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-emerald-100/30"
      >
        <div className="flex items-center gap-2 text-emerald-900">
          {isStreaming ? (
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <Lightbulb className="size-4 shrink-0 text-emerald-600" />
          )}
          <span className="text-sm font-medium">{isStreaming ? "正在深度思考…" : "已深度思考"}</span>
        </div>
        {!isStreaming && (
          <ChevronDown className={cn("size-4 text-emerald-600 transition-transform", open && "rotate-180")} />
        )}
      </button>
      {open && (
        <div className="border-t border-emerald-200/50 px-4 py-3 text-sm text-emerald-950">
          <WeKnoraAssistantMarkdown streaming={!!isStreaming}>{content}</WeKnoraAssistantMarkdown>
        </div>
      )}
    </div>
  );
}

function AgentPickerMenu(props: {
  children: ReactNode;
  agentsList: WeKnoraAgent[];
  agentId: string | null;
  onAgentChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  align?: "start" | "end" | "center";
}) {
  const {
    children,
    agentsList,
    agentId,
    onAgentChange,
    disabled,
    loading,
    error,
    align = "start",
  } = props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="z-[60] w-80 max-h-[min(24rem,70vh)] overflow-y-auto">
        <DropdownMenuLabel>选择智能体</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {error ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">智能体列表加载失败，请刷新重试</p>
        ) : loading && agentsList.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">正在加载智能体…</p>
        ) : agentsList.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">暂无可用智能体</p>
        ) : (
          <DropdownMenuRadioGroup
            value={agentId ?? ""}
            onValueChange={(v) => {
              if (v) onAgentChange(v);
            }}
          >
            {agentsList.map((a) => (
              <DropdownMenuRadioItem key={a.id} value={a.id} className="items-start py-2.5">
                <span className="flex flex-col gap-0.5 text-left">
                  <span className="font-medium">{a.name}</span>
                  {a.description?.trim() ? (
                    <span className="text-muted-foreground text-xs font-normal leading-snug">
                      {a.description.trim()}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WeKnoraChatDock(props: {
  sessionId: string | null;
  knowledgeBaseId: string;
  /** Current custom/builtin agent; used to filter Studio 快捷技能 to admin-configured skills. */
  agentId: string | null;
  /** Called when the user picks another agent from the header or input toolbar. */
  onAgentChange: (id: string) => void;
  projectName?: string;
  onFirstMessageComplete?: (sessionId: string, messages: { role: string; content: string }[]) => void;
  onQuickSkill?: (kind: string, title: string) => void;
  /**
   * When set, skips internal `/api/v1/skills/studio-quick` fetch so the parent can share one query
   * with the Studio side panel (same list as 魔棒).
   */
  studioQuickSkillsFromParent?: {
    items: WeKnoraStudioQuickSkillItem[];
    isLoading: boolean;
    isError: boolean;
  };
}) {
  const {
    sessionId,
    knowledgeBaseId,
    agentId,
    onAgentChange,
    projectName,
    onFirstMessageComplete,
    onQuickSkill,
    studioQuickSkillsFromParent,
  } = props;

  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamEventItem[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [showSkillPopover, setShowSkillPopover] = useState(false);
  const [knowledgeDocs, setKnowledgeDocs] = useState<{id: string; title: string}[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionButtonRef = useRef<HTMLButtonElement>(null);

  const history = useQuery({
    queryKey: ["weknora-messages", sessionId],
    queryFn: () => messagesApi.loadMessages(sessionId!, 80),
    enabled: sessionId != null && sessionId.length > 0,
    /** 刷新后服务端可能仍在写助手消息；轮询直到 is_completed 为 true，避免长期停在「未完成」占位。 */
    refetchInterval: (q) => {
      const data = q.state.data as WeKnoraMessage[] | undefined;
      if (!data?.length) {
        return false;
      }
      const rows = [...data].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const last = rows[rows.length - 1];
      if (last?.role === "assistant" && last.is_completed === false) {
        return 2500;
      }
      return false;
    },
  });

  const agents = useQuery({
    queryKey: ["weknora-agents"],
    queryFn: () => agentsApi.listAgents(),
  });

  const studioQuickSkillsQuery = useQuery({
    queryKey: ["weknora-studio-quick-skills", agentId],
    queryFn: () => fetchStudioQuickSkills(agentId),
    enabled:
      studioQuickSkillsFromParent === undefined &&
      agentId != null &&
      agentId.length > 0,
    staleTime: 60_000,
  });

  const studioQuickSkills =
    studioQuickSkillsFromParent?.items ?? studioQuickSkillsQuery.data?.items ?? [];
  const studioQuickLoading = studioQuickSkillsFromParent
    ? studioQuickSkillsFromParent.isLoading
    : studioQuickSkillsQuery.isLoading;
  const studioQuickError = studioQuickSkillsFromParent
    ? studioQuickSkillsFromParent.isError
    : studioQuickSkillsQuery.isError;

  const agentRows = useMemo(() => agents.data ?? [], [agents.data]);

  const currentAgent = useMemo((): WeKnoraAgent | undefined => {
    return agentRows.find((a) => a.id === agentId);
  }, [agentRows, agentId]);

  useEffect(() => {
    setStreamingText(null);
    setStreamEvents([]);
    setStreamError(null);
    setIsContinuing(false);
  }, [sessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.data, streamingText, streamEvents]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Load knowledge documents for @ mention
  useEffect(() => {
    if (!knowledgeBaseId) return;
    knowledgeApi.listKnowledge(knowledgeBaseId, { page: 1, page_size: 100 })
      .then((res) => {
        const docs = (res.data ?? []).map((k) => ({
          id: k.id,
          title: k.file_name || k.title || "未命名",
        }));
        setKnowledgeDocs(docs);
      })
      .catch(() => {
        setKnowledgeDocs([]);
      });
  }, [knowledgeBaseId]);

  const kbFileIndex = useMemo(() => buildKnowledgeFileIndex(knowledgeDocs), [knowledgeDocs]);

  const handleStreamEvent = useCallback((evt: WeKnoraStreamResponse) => {
    if (evt.response_type === "answer" || evt.response_type === "complete") return;
    if (evt.response_type === "agent_complete") return;
    const data = (evt.data ?? {}) as Record<string, unknown>;
    setStreamEvents((prev) => {
      if (evt.response_type === "thinking") {
        const id = buildStreamEventID(evt);
        const existingIdx = prev.findIndex((x) => x.id === id);
        if (existingIdx >= 0) {
          const next = [...prev];
          const item = next[existingIdx]!;
          next[existingIdx] = {
            ...item,
            content: `${item.content ?? ""}${evt.content ?? ""}`,
            pending: !evt.done,
          };
          return next;
        }
        return [
          ...prev,
          { id, type: "thinking", title: "深度思考", content: evt.content ?? "", pending: !evt.done },
        ];
      }

      if (evt.response_type === "tool_call") {
        const toolCallID = typeof data.tool_call_id === "string" ? data.tool_call_id : undefined;
        const args = typeof data.arguments === "string" ? data.arguments : typeof data.args === "string" ? data.args : "";
        return [
          ...prev,
          {
            id: buildStreamEventID(evt),
            type: "tool_call",
            title: `调用工具: ${extractToolName(evt)}`,
            content: args,
            pending: true,
            toolCallID,
          },
        ];
      }

      if (evt.response_type === "tool_result") {
        const toolCallID = typeof data.tool_call_id === "string" ? data.tool_call_id : undefined;
        const output = typeof data.output === "string" && data.output ? data.output : evt.content ?? "";
        const success = typeof data.success === "boolean" ? data.success : true;
        if (toolCallID) {
          const idx = prev.findIndex((x) => x.toolCallID === toolCallID);
          if (idx >= 0) {
            const next = [...prev];
            const old = next[idx]!;
            next[idx] = {
              ...old,
              type: "tool_result",
              title: `${old.title.replace("调用工具", "工具结果")} ${success ? "✓" : "✗"}`,
              content: output,
              pending: false,
              success,
            };
            return next;
          }
        }
        return [
          ...prev,
          {
            id: buildStreamEventID(evt),
            type: "tool_result",
            title: `工具结果: ${extractToolName(evt)} ${success ? "✓" : "✗"}`,
            content: output,
            pending: false,
            success,
            toolCallID,
          },
        ];
      }

      return [
        ...prev,
        {
          id: buildStreamEventID(evt),
          type: "other",
          title: `事件: ${evt.response_type}`,
          content: evt.content || "",
        },
      ];
    });
  }, []);

  // Auto-resume incomplete assistant message via continue-stream
  useEffect(() => {
    if (!sessionId) return;
    if (isStreaming || isContinuing) return;
    const data = history.data as WeKnoraMessage[] | undefined;
    if (!data?.length) return;
    const sorted = [...data].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const last = sorted[sorted.length - 1];
    if (last?.role === "assistant" && last.is_completed === false && last.id) {
      setIsContinuing(true);
      setStreamError(null);
      setStreamingText("");
      setStreamEvents([]);
      setIsStreaming(true);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      void continueAgentChatStream(
        { sessionId, messageId: last.id },
        {
          onText: (t) => setStreamingText(t),
          onEvent: handleStreamEvent,
          onError: (e) => {
            setStreamError(e.message);
            setIsStreaming(false);
            setIsContinuing(false);
          },
          onComplete: () => {
            setStreamingText(null);
            setStreamEvents([]);
            setIsStreaming(false);
            setIsContinuing(false);
            void qc.invalidateQueries({ queryKey: ["weknora-messages", sessionId] });
          },
          signal: ac.signal,
        },
      ).catch(() => {
        setIsStreaming(false);
        setIsContinuing(false);
      });
    }
  }, [sessionId, history.data, isStreaming, isContinuing, qc, handleStreamEvent]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText(null);
    setStreamEvents([]);
  }, []);

  const sendMut = useMutation({
    mutationFn: async (query: string) => {
      if (!sessionId || !agentId) throw new Error("missing session or agent");
      setStreamError(null);
      setStreamingText("");
      setStreamEvents([]);
      setIsStreaming(true);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      // Get current message count before sending
      const currentMessages = history.data ?? [];
      const wasEmpty = currentMessages.length === 0;

      try {
        await streamAgentChat(
          {
            sessionId,
            query,
            knowledgeBaseIds: [knowledgeBaseId],
            agentId,
          },
          {
            onText: (t) => setStreamingText(t),
            onEvent: handleStreamEvent,
            onConnected: () => {
              void qc.invalidateQueries({ queryKey: ["weknora-messages", sessionId] });
            },
            onError: (e) => {
              setStreamError(e.message);
              setIsStreaming(false);
            },
            onComplete: () => {
              setStreamingText(null);
              setStreamEvents([]);
              setIsStreaming(false);
              void qc.invalidateQueries({ queryKey: ["weknora-messages", sessionId] });

              // After first message exchange, trigger title generation
              if (wasEmpty && onFirstMessageComplete && sessionId) {
                // Wait for history to refresh with new messages
                setTimeout(() => {
                  void qc.fetchQuery({ queryKey: ["weknora-messages", sessionId] })
                    .then((raw) => {
                      const msgList = Array.isArray(raw)
                        ? raw
                        : ((raw as { data?: { role: string; content: string }[] })?.data ?? []);
                      if (msgList.length >= 2) {
                        onFirstMessageComplete(sessionId, msgList.map((m) => ({
                          role: m.role,
                          content: m.content,
                        })));
                      }
                    })
                    .catch(() => { /* ignore */ });
                }, 500);
              }
            },
            signal: ac.signal,
          },
        );
      } catch {
        setIsStreaming(false);
      }
    },
  });

  const busy = isStreaming;

  const displayMessages: WeKnoraMessage[] = useMemo(() => {
    const sorted = [...(history.data ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    if (isContinuing && sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      if (last?.role === "assistant" && last.is_completed === false) {
        return sorted.slice(0, -1);
      }
    }
    return sorted;
  }, [history.data, isContinuing]);
  const showAssistantPending =
    streamingText != null || streamEvents.length > 0 || (busy && streamingText === "");
  const isEmpty = displayMessages.length === 0 && !showAssistantPending;

  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || busy || !agentId) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void sendMut.mutateAsync(q);
  }, [input, busy, agentId, sendMut]);

  // 渲染单条消息气泡
  const renderMessage = (m: WeKnoraMessage) => {
    const isUser = m.role === "user";
    if (isUser) {
      return (
        <div key={m.id} className="flex w-full gap-3 px-4 py-3 justify-end">
          <div className="max-w-[min(85%,720px)] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed bg-[#1a1a1a] text-white rounded-br-md">
            {m.content}
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
            <span className="text-xs font-bold text-white">U</span>
          </div>
        </div>
      );
    }

    const { thinking, content: answerMd } = splitRedactedThinking(m.content);
    const persistedSteps = Array.isArray(m.agent_steps) ? m.agent_steps : [];
    const hasPersistedSteps = persistedSteps.length > 0;
    const hasPersistedThought = persistedSteps.some((s) => s.thought?.trim());
    /** 优先使用落库的 thought；若 steps 中没有 thought，则回退到正文里 redacted_thinking，避免刷新后思考过程丢失。 */
    const thinkingFromContent = hasPersistedThought ? null : thinking;
    const incomplete = m.is_completed === false;
    const hasAnswer = Boolean(answerMd?.trim());
    const showIncompleteHint = incomplete && !thinkingFromContent && !hasPersistedSteps && !hasAnswer;

    return (
      <div key={m.id} className="flex w-full gap-3 px-4 py-3 justify-start">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm">
          <Sparkles className="h-4 w-4 text-slate-600" />
        </div>
        <div className="max-w-[min(85%,720px)] flex flex-col gap-1">
          {hasPersistedSteps ? <PersistedAgentStepsTimeline steps={persistedSteps} /> : null}
          {thinkingFromContent ? <ThinkingBlock content={thinkingFromContent} /> : null}
          {hasAnswer ? (
            <div className="rounded-2xl rounded-bl-md bg-[#f5f5f5] px-5 py-3.5 text-[15px] text-[#1a1a1a]">
              <WeKnoraAssistantMarkdown streaming={false}>{answerMd}</WeKnoraAssistantMarkdown>
            </div>
          ) : null}
          {showIncompleteHint ? (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <WeKnoraKbCitationProvider value={kbFileIndex}>
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-5 py-3">
        <div>
          <p className="text-xs text-gray-400">项目</p>
          <p className="text-base font-semibold text-gray-900">
            {projectName ?? "加载中…"}
          </p>
        </div>
        <AgentPickerMenu
          agentsList={agentRows}
          agentId={agentId}
          onAgentChange={onAgentChange}
          loading={agents.isPending}
          error={agents.isError}
          disabled={busy}
          align="end"
        >
          <button
            type="button"
            title="切换智能体"
            className={cn(
              "flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 transition-colors",
              "hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50",
              agentId ? "text-slate-600" : "text-slate-400",
            )}
            disabled={busy}
          >
            <Brain className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="truncate text-xs">
              {currentAgent?.name ?? (agents.isPending ? "加载中…" : "选择智能体")}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>
        </AgentPickerMenu>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ scrollBehavior: "smooth" }}
      >
        {!sessionId && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">请选择或创建一个对话。</p>
          </div>
        )}

        {sessionId && !isEmpty && (
          <div className="flex flex-col gap-1 py-4">
            {displayMessages.map(renderMessage)}
            {showAssistantPending && (
              <div className="flex w-full gap-3 px-4 py-3 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm">
                  <Sparkles className="h-4 w-4 text-slate-600" />
                </div>
                <div className="max-w-[min(85%,720px)] flex flex-col gap-1">
                  {(() => {
                    const rows: TimelineRowData[] = streamEvents.map((ev) => {
                      if (ev.type === "thinking") {
                        return {
                          id: ev.id,
                          type: "thinking",
                          title: ev.pending ? "正在深度思考…" : "已深度思考",
                          content: ev.content ?? "",
                          pending: ev.pending,
                        };
                      }
                      const toolName = ev.title.replace(/^调用工具:\s*/, "").replace(/^工具结果:\s*/, "").trim();
                      const meta = getToolIconAndLabel(toolName);
                      const isResult = ev.type === "tool_result";
                      return {
                        id: ev.id,
                        type: isResult ? "tool_result" : "tool_call",
                        title: isResult
                          ? `工具结果: ${meta.label}${ev.success === false ? " ✗" : " ✓"}`
                          : `调用 ${meta.label}: ${toolName || "tool"}`,
                        content: ev.content ?? "",
                        pending: ev.pending,
                        success: ev.success,
                        args: ev.type === "tool_call" ? (ev.content ?? "") : undefined,
                        meta,
                      };
                    });
                    return rows.length > 0 ? (
                      <AgentTimeline rows={rows} title="工具执行过程" streaming={busy} />
                    ) : null;
                  })()}
                  {(() => {
                    const parsed = streamingText
                      ? splitRedactedThinking(streamingText)
                      : { thinking: null, content: "", thinkingIncomplete: false };
                    const { thinking, content, thinkingIncomplete } = parsed;
                    const showAnswerSlot =
                      content.trim().length > 0 || (busy && !thinkingIncomplete);
                    return (
                      <>
                        {thinking && <ThinkingBlock content={thinking} isStreaming={busy && thinkingIncomplete} />}
                        {showAnswerSlot && (
                          <div className="rounded-2xl rounded-bl-md bg-[#f5f5f5] px-5 py-3.5 text-[15px] text-[#1a1a1a]">
                            {content.trim() ? (
                              <WeKnoraAssistantMarkdown streaming={busy}>{content}</WeKnoraAssistantMarkdown>
                            ) : busy ? (
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
                              </div>
                            ) : null}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {streamError && (
              <p className="px-4 text-xs text-red-500">{streamError}</p>
            )}
          </div>
        )}
      </div>

      {/* Input area - Frontend style */}
      {sessionId && (
        <div className="shrink-0 px-4 pb-6 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <div className="group relative rounded-[1.75rem] border border-gray-200 bg-white shadow-sm transition-all focus-within:border-gray-300 focus-within:shadow-md">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setInput(newValue);
                  // Show mention popover when user types @
                  if (newValue.endsWith("@")) {
                    setShowMentionPopover(true);
                  }
                }}
                placeholder={agentId ? "直接向模型提问…" : "正在加载智能体…"}
                disabled={!agentId || busy}
                rows={1}
                className="w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[15px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                style={{ minHeight: "52px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              {/* Toolbar */}
              <div className="flex items-center justify-between px-3 pb-2">
                <div className="flex items-center gap-0.5">
                  <AgentPickerMenu
                    agentsList={agentRows}
                    agentId={agentId}
                    onAgentChange={onAgentChange}
                    loading={agents.isPending}
                    error={agents.isError}
                    disabled={busy}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600",
                        agentId && "text-gray-600",
                      )}
                      title="选择智能体"
                      disabled={busy}
                    >
                      <Brain className="h-4 w-4" />
                    </button>
                  </AgentPickerMenu>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="联网搜索"
                  >
                    <Globe className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="上传图片"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                  <button
                    ref={mentionButtonRef}
                    type="button"
                    onClick={() => setShowMentionPopover((v) => !v)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="@提及知识库资料"
                  >
                    <AtSign className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSkillPopover((v) => !v)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="技能生成"
                  >
                    <Wand2 className="h-4 w-4" />
                  </button>

                  {/* Skill Popover */}
                  {showSkillPopover && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowSkillPopover(false)}
                      />
                      <div className="absolute left-12 bottom-12 z-50 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                        <div className="mb-2 px-2 py-1 text-xs font-medium text-gray-500">
                          选择技能
                        </div>
                        <ul className="max-h-48 overflow-y-auto">
                          {!agentId ? (
                            <li className="px-2 py-3 text-center text-xs text-gray-400">请选择智能体后查看可用技能</li>
                          ) : studioQuickLoading ? (
                            <li className="px-2 py-3 text-center text-xs text-gray-400">加载技能列表…</li>
                          ) : studioQuickError ? (
                            <li className="px-2 py-3 text-center text-xs text-amber-600">
                              无法加载技能列表，请稍后重试
                            </li>
                          ) : studioQuickSkills.length === 0 ? (
                            <li className="px-2 py-3 text-center text-xs text-gray-400">
                              当前智能体下没有可用的 Studio 快捷项（数据来自接口 /api/v1/skills/studio-quick；仅含可对应网页/幻灯片/播客等
                              Studio 任务的技能；如 image-generation 等不会出现在此菜单）
                            </li>
                          ) : (
                            studioQuickSkills.map((skill) => {
                              const Icon = studioQuickSkillIcon(skill.icon);
                              const iconTone = studioQuickIconTone(skill.icon);
                              return (
                                <li key={skill.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onQuickSkill?.(skill.studioKind, skill.defaultTitle);
                                      setShowSkillPopover(false);
                                    }}
                                    className="w-full truncate rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                    title={skill.description?.trim() || skill.label}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Icon className={cn("h-4 w-4 shrink-0", iconTone)} />
                                      <span>{skill.label}</span>
                                    </div>
                                  </button>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    </>
                  )}

                  {/* Mention Popover */}
                  {showMentionPopover && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowMentionPopover(false)}
                      />
                      <div className="absolute left-12 bottom-12 z-50 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                        <div className="mb-2 px-2 py-1 text-xs font-medium text-gray-500">
                          选择资料
                        </div>
                        {knowledgeDocs.length === 0 ? (
                          <div className="px-2 py-3 text-center text-xs text-gray-400">
                            暂无可用资料
                          </div>
                        ) : (
                          <ul className="max-h-48 overflow-y-auto">
                            {knowledgeDocs.map((doc) => (
                              <li key={doc.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const mention = `@${doc.title} `;
                                    setInput((prev) => prev + mention);
                                    setShowMentionPopover(false);
                                    textareaRef.current?.focus();
                                  }}
                                  className="w-full truncate rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                  title={doc.title}
                                >
                                  {doc.title}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className="flex max-w-[10rem] items-center gap-1.5 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500"
                    title={currentAgent?.name ?? undefined}
                  >
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="truncate">{currentAgent?.name ?? "智能体"}</span>
                  </div>

                  {/* Send / Stop button */}
                  {busy ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-500 transition-all hover:bg-red-100"
                      title="停止生成"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!agentId || !input.trim()}
                      onClick={handleSend}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                        input.trim() && agentId
                          ? "bg-[#1a1a1a] text-white shadow-md hover:bg-[#333]"
                          : "bg-gray-100 text-gray-300",
                      )}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </WeKnoraKbCitationProvider>
  );
}
