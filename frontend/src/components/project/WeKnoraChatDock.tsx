import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ArrowUp, ChevronDown, Globe, Image as ImageIcon, AtSign, Sparkles, Brain, Square, Lightbulb, Wand2, Presentation, FileCode } from "lucide-react";
import { streamAgentChat } from "@/api/weknora/agentChatStream";
import * as messagesApi from "@/api/weknora/messages";
import * as agentsApi from "@/api/weknora/agents";
import * as knowledgeApi from "@/api/weknora/knowledge";
import type { WeKnoraMessage } from "@/api/weknora/types";
import type { WeKnoraAgent } from "@/api/weknora/agents";
import type { WeKnoraStreamResponse } from "@/api/weknora/types";
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { AgentCanvasFrame } from "@/components/weknora/agent-canvas-frame";
import { CollapsibleContent } from "@/components/ui/collapsible";
import { WeKnoraAssistantMarkdown } from "@/core/streamdown";
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

// Collapsible thinking — same interaction model as deer-flow `ai-elements/reasoning`.
function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return (
    <Reasoning
      isStreaming={!!isStreaming}
      className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/50 shadow-sm"
    >
      <ReasoningTrigger
        className="px-4 py-2.5 text-amber-900 hover:text-amber-950"
        getThinkingMessage={(streaming) => (
          <>
            <Lightbulb className="size-4 shrink-0 text-amber-600" />
            <span className="text-sm font-medium">{streaming ? "正在深度思考…" : "已深度思考"}</span>
          </>
        )}
      />
      <CollapsibleContent className="border-t border-amber-200/60 px-4 pb-3 pt-2 outline-none data-[state=open]:animate-in">
        <WeKnoraAssistantMarkdown streaming={!!isStreaming} className="text-amber-950">
          {content}
        </WeKnoraAssistantMarkdown>
      </CollapsibleContent>
    </Reasoning>
  );
}

function buildSuggestedQuestions(knowledgeTitles: string[]): string[] {
  const titles = knowledgeTitles.filter(Boolean);
  const primary = titles[0];
  if (primary) {
    return [
      `请概括《${primary}》的核心内容`,
      `请提炼《${primary}》中的关键观点与结论`,
      `根据《${primary}》列出值得关注的问题`,
      titles.length > 1
        ? `请比较《${titles[0]}》和《${titles[1]}》的重点差异`
        : `请根据《${primary}》给出一份简明摘要`,
    ];
  }
  return [
    "请概括当前资料的核心内容",
    "请提炼这些资料的关键观点",
    "请根据资料给出一份简明摘要",
    "请列出资料里最值得关注的问题",
  ];
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
  agentId: string | null;
  /** Called when the user picks another agent from the header or input toolbar. */
  onAgentChange: (id: string) => void;
  projectName?: string;
  knowledgeDocCount?: number;
  knowledgeTitles?: string[];
  onFirstMessageComplete?: (sessionId: string, messages: { role: string; content: string }[]) => void;
  onQuickSkill?: (kind: string, title: string) => void;
}) {
  const {
    sessionId,
    knowledgeBaseId,
    agentId,
    onAgentChange,
    projectName,
    knowledgeDocCount = 0,
    knowledgeTitles = [],
    onFirstMessageComplete,
    onQuickSkill,
  } = props;

  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamEventItem[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
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
  });

  const agents = useQuery({
    queryKey: ["weknora-agents"],
    queryFn: () => agentsApi.listAgents(),
  });

  const agentRows = useMemo(() => agents.data ?? [], [agents.data]);

  const currentAgent = useMemo((): WeKnoraAgent | undefined => {
    return agentRows.find((a) => a.id === agentId);
  }, [agentRows, agentId]);

  useEffect(() => {
    setStreamingText(null);
    setStreamEvents([]);
    setStreamError(null);
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

  const displayMessages: WeKnoraMessage[] = [...(history.data ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const showAssistantPending =
    streamingText != null || streamEvents.length > 0 || (busy && streamingText === "");
  const isEmpty = displayMessages.length === 0 && !showAssistantPending;
  const suggestedQuestions = buildSuggestedQuestions(knowledgeTitles);

  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || busy || !agentId) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void sendMut.mutateAsync(q);
  }, [input, busy, agentId, sendMut]);

  const handleSuggestedClick = useCallback((q: string) => {
    setInput(q);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

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

    return (
      <div key={m.id} className="flex w-full gap-3 px-4 py-3 justify-start">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm">
          <Sparkles className="h-4 w-4 text-slate-600" />
        </div>
        <div className="max-w-[min(85%,720px)] flex flex-col gap-1">
          {thinking && <ThinkingBlock content={thinking} />}
          {answerMd ? (
            <div className="rounded-2xl rounded-bl-md bg-[#f5f5f5] px-5 py-3.5 text-[15px] text-[#1a1a1a]">
              <WeKnoraAssistantMarkdown streaming={false}>{answerMd}</WeKnoraAssistantMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
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

        {sessionId && isEmpty && (
          /* Empty state - Frontend style */
          <div className="flex h-full flex-col items-center justify-center px-6 pb-20">
            <div className="mb-10 text-center">
              <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900">
                {projectName?.trim() ? `围绕「${projectName.trim()}」资料提问` : "围绕当前资料提问"}
              </h1>
              <p className="text-base text-gray-400">
                {knowledgeDocCount === 0
                  ? "请先上传资料，我将根据文档内容为您解答"
                  : "可以从资料摘要、重点提炼、问题梳理或对比分析开始"}
              </p>
            </div>

            {/* Suggested questions - only show when docs exist */}
            {knowledgeDocCount > 0 && (
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2.5 px-4">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSuggestedClick(q)}
                    className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-md"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
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
                  {streamEvents.length > 0 && (
                    <div className="mb-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-slate-500">
                        <Brain className="h-3.5 w-3.5" />
                        工具执行过程
                      </div>
                      <div className="relative space-y-2 pl-4 before:absolute before:inset-y-0 before:left-[7px] before:w-px before:bg-slate-200">
                        {streamEvents.map((ev) => {
                          if (ev.type === "thinking" && ev.content) {
                            return (
                              <div key={ev.id} className="relative">
                                <span className="absolute top-3 -left-[13px] h-2.5 w-2.5 rounded-full border border-amber-300 bg-amber-200" />
                                <ThinkingBlock content={ev.content} isStreaming={ev.pending} />
                              </div>
                            );
                          }
                          const fileTree = ev.content ? tryParseFileTree(ev.content) : null;
                          return (
                            <div
                              key={ev.id}
                              className={cn(
                                "relative rounded-xl border bg-white px-4 py-3 text-sm shadow-sm",
                                ev.success === false
                                  ? "border-red-200 text-red-700"
                                  : "border-slate-200 text-slate-700",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-3 -left-[13px] h-2.5 w-2.5 rounded-full border",
                                  ev.success === false
                                    ? "border-red-300 bg-red-200"
                                    : "border-slate-300 bg-slate-200",
                                )}
                              />
                              <div className="mb-1 flex items-center justify-between">
                                <span className="font-medium">{ev.title}</span>
                                {ev.pending ? (
                                  <span className="text-xs text-slate-400">执行中…</span>
                                ) : null}
                              </div>
                              {ev.content ? (
                                <div className="mt-1 min-w-0 text-inherit">
                                  {ev.type === "tool_result" ? (
                                    (() => {
                                      const graph = tryParseAgentGraph(ev.content);
                                      if (graph && (graph.nodes.length > 0 || graph.edges.length > 0)) {
                                        return (
                                          <AgentCanvasFrame
                                            nodes={graph.nodes}
                                            edges={graph.edges}
                                            className="mt-1 min-h-[240px] border-slate-200"
                                          />
                                        );
                                      }
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
                                        <WeKnoraAssistantMarkdown streaming={!!ev.pending} className="text-inherit">
                                          {ev.content}
                                        </WeKnoraAssistantMarkdown>
                                      );
                                    })()
                                  ) : (
                                    <WeKnoraAssistantMarkdown streaming={!!ev.pending} className="text-inherit">
                                      {ev.content}
                                    </WeKnoraAssistantMarkdown>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                onQuickSkill?.("slides", "PPT演示文稿");
                                setShowSkillPopover(false);
                              }}
                              className="w-full truncate rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                              title="HTML PPT 精致演示文稿设计器"
                            >
                              <div className="flex items-center gap-2">
                                <Presentation className="h-4 w-4 text-indigo-500" />
                                <span>生成 PPT 演示文稿</span>
                              </div>
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                onQuickSkill?.("html", "教学网页");
                                setShowSkillPopover(false);
                              }}
                              className="w-full truncate rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                              title="网页生成器"
                            >
                              <div className="flex items-center gap-2">
                                <FileCode className="h-4 w-4 text-emerald-500" />
                                <span>生成教学网页</span>
                              </div>
                            </button>
                          </li>
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
  );
}
