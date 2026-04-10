"use client";

import { Box } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { getChunkByIdOnly, listKnowledgeChunksPage } from "@/api/weknora/chunks";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type CacheEntry =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; content: string }
  | { status: "err"; message: string };

const chunkDetailCache = new Map<string, CacheEntry>();

function getCache(id: string): CacheEntry {
  return chunkDetailCache.get(id) ?? { status: "idle" };
}

function setCache(id: string, e: CacheEntry) {
  chunkDetailCache.set(id, e);
}

export type KbCitationLinkProps = {
  chunkId: string;
  docTitle: string;
  className?: string;
  children?: ReactNode;
};

const docResolveCache = new Map<string, string | "__err__">();

function getCachedDocChunk(knowledgeId: string): string | "__err__" | undefined {
  return docResolveCache.get(knowledgeId);
}

function setCachedDocChunk(knowledgeId: string, chunkId: string | "__err__") {
  docResolveCache.set(knowledgeId, chunkId);
}

/** Keeps preview compact; body scrolls inside. */
const KB_CITATION_HOVER_CONTENT_CLASS =
  "border-border/80 bg-popover z-[100] flex w-[min(100vw-2rem,26rem)] max-h-[min(48vh,16rem)] flex-col overflow-hidden p-0 shadow-xl";

/** Radix DismissableLayer dispatches a CustomEvent; the real target is on `detail.originalEvent`. */
function pointerOutsideEventTarget(e: unknown): Node | null {
  if (!e || typeof e !== "object") return null;
  const rec = e as Record<string, unknown>;
  const detail = rec.detail as Record<string, unknown> | undefined;
  const original = detail?.originalEvent;
  if (original && typeof original === "object" && "target" in original) {
    const t = (original as Event).target;
    if (t instanceof Node) return t;
  }
  const t = rec.target;
  return t instanceof Node ? t : null;
}

function preventCloseWhenPointerOnTrigger(
  triggerRef: RefObject<HTMLButtonElement | null>,
) {
  return (e: { preventDefault: () => void }) => {
    const t = pointerOutsideEventTarget(e);
    if (t && triggerRef.current?.contains(t)) {
      e.preventDefault();
    }
  };
}

const CitationPill = forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    className?: string;
    title?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
    onFocus?: React.FocusEventHandler<HTMLButtonElement>;
    onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  }
>(function CitationPill(
  { children, className, title, onClick, onMouseEnter, onMouseLeave, onFocus, onBlur },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "border-emerald-500/50 bg-emerald-500/10 text-emerald-900",
        "hover:border-emerald-600/70 hover:bg-emerald-500/16 hover:shadow-sm",
        "dark:border-emerald-400/45 dark:bg-emerald-400/12 dark:text-emerald-50",
        "dark:hover:border-emerald-300/60 dark:hover:bg-emerald-400/18",
        "mx-0.5 inline-flex max-w-[min(100%,14rem)] cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 align-baseline text-xs font-normal",
        "transition-all duration-200 ease-out select-none",
        "focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
    >
      <Box
        className="text-emerald-600 dark:text-emerald-300 size-3.5 shrink-0"
        aria-hidden
      />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
});

function PopoverBody({ chunkId, docTitle }: { chunkId: string; docTitle: string }) {
  const [entry, setEntry] = useState<CacheEntry>(() => getCache(chunkId));

  const syncFromCache = useCallback(() => {
    setEntry(getCache(chunkId));
  }, [chunkId]);

  useEffect(() => {
    setEntry(getCache(chunkId));
  }, [chunkId]);

  useEffect(() => {
    // ensure cache updates are reflected while popup remains open
    const id = window.setInterval(() => {
      const latest = getCache(chunkId);
      setEntry((prev) =>
        prev.status !== latest.status ||
        (prev.status === "ok" && latest.status === "ok" && prev.content !== latest.content) ||
        (prev.status === "err" && latest.status === "err" && prev.message !== latest.message)
          ? latest
          : prev,
      );
    }, 300);
    return () => window.clearInterval(id);
  }, [chunkId]);

  const title = docTitle?.trim() || chunkId;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="bg-muted/40 border-border/60 shrink-0 border-b px-3.5 py-2.5">
        <p className="text-foreground text-sm font-semibold leading-snug">{title}</p>
      </div>
      <div className="text-foreground/90 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap [scrollbar-gutter:stable]">
        {entry.status === "loading" || entry.status === "idle" ? (
          <span className="text-muted-foreground/80">加载中…</span>
        ) : entry.status === "err" ? (
          <span className="text-destructive">{entry.message}</span>
        ) : (
          entry.content
        )}
      </div>
      <div className="border-border/60 text-muted-foreground shrink-0 border-t bg-muted/30 px-3.5 py-1.5 text-xs">
        片段ID: {chunkId}
      </div>
    </div>
  );
}

/**
 * Citation when the model only named a file (no chunk id): resolve first text chunk for this knowledge file.
 */
export function KbDocCitationLink({
  knowledgeId,
  docTitle,
  className,
  children,
}: {
  knowledgeId: string;
  docTitle: string;
  className?: string;
  children?: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const cached = getCachedDocChunk(knowledgeId);
  const initialChunk = cached && cached !== "__err__" ? cached : null;
  const [resolvedChunkId, setResolvedChunkId] = useState<string | null>(initialChunk);
  const [resolving, setResolving] = useState(false);

  const resolve = useCallback(async () => {
    if (resolvedChunkId) {
      return;
    }
    const c = getCachedDocChunk(knowledgeId);
    if (c && c !== "__err__") {
      setResolvedChunkId(c);
      return;
    }
    if (c === "__err__") {
      return;
    }
    setResolving(true);
    try {
      const res = await listKnowledgeChunksPage(knowledgeId, 1, 20);
      const rows = res.data ?? [];
      const first = rows.find((r) => r.id?.trim())?.id?.trim();
      if (first) {
        setCachedDocChunk(knowledgeId, first);
        setResolvedChunkId(first);
      } else {
        setCachedDocChunk(knowledgeId, "__err__");
      }
    } catch {
      setCachedDocChunk(knowledgeId, "__err__");
    } finally {
      setResolving(false);
    }
  }, [knowledgeId, resolvedChunkId]);

  const loadChunkContent = useCallback(
    async (chunkId: string) => {
      const cur = getCache(chunkId);
      if (cur.status === "loading" || cur.status === "ok" || cur.status === "err") {
        return;
      }
      setCache(chunkId, { status: "loading" });
      try {
        const res = await getChunkByIdOnly(chunkId);
        const content = res.data?.content?.trim();
        if (content) {
          setCache(chunkId, { status: "ok", content });
        } else {
          setCache(chunkId, { status: "err", message: "未找到片段内容" });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "加载失败";
        setCache(chunkId, { status: "err", message: msg });
      }
    },
    [],
  );

  const title = docTitle?.trim() || knowledgeId;
  const label: ReactNode = children ?? title;

  const handleOpenChange = useCallback(
    async (next: boolean) => {
      setHoverOpen(next);
      if (next) {
        await resolve();
        const id = getCachedDocChunk(knowledgeId);
        if (id && id !== "__err__") {
          void loadChunkContent(id);
        }
      }
    },
    [knowledgeId, loadChunkContent, resolve],
  );

  return (
    <HoverCard
      open={hoverOpen}
      onOpenChange={handleOpenChange}
      closeDelay={200}
      openDelay={80}
    >
      <HoverCardTrigger asChild>
        <CitationPill
          ref={triggerRef}
          className={className}
          title={title}
          onClick={(e) => {
            e.preventDefault();
            // 悬停已打开时不要 toggle 关闭（否则首击像「闪退」）；仅在为关时用点击打开。
            if (hoverOpen) return;
            void handleOpenChange(true);
          }}
        >
          {label}
        </CitationPill>
      </HoverCardTrigger>
      <HoverCardContent
        className={KB_CITATION_HOVER_CONTENT_CLASS}
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        onPointerDownOutside={preventCloseWhenPointerOnTrigger(triggerRef)}
        onInteractOutside={preventCloseWhenPointerOnTrigger(triggerRef)}
        onFocusOutside={preventCloseWhenPointerOnTrigger(triggerRef)}
      >
        {resolvedChunkId ? (
          <PopoverBody chunkId={resolvedChunkId} docTitle={title} />
        ) : resolving ? (
          <div className="p-3 text-sm text-muted-foreground">正在关联知识片段…</div>
        ) : getCachedDocChunk(knowledgeId) === "__err__" ? (
          <div className="p-3 text-sm text-destructive">
            无法解析该文件的片段，请稍后在资料中打开文件。
          </div>
        ) : (
          <div className="p-3 text-sm text-muted-foreground">悬停以加载引用…</div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function KbCitationLink({
  chunkId,
  docTitle,
  className,
  children,
}: KbCitationLinkProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);

  const load = useCallback(() => {
    const cur = getCache(chunkId);
    if (cur.status === "loading" || cur.status === "ok" || cur.status === "err") {
      return;
    }
    setCache(chunkId, { status: "loading" });
    void (async () => {
      try {
        const res = await getChunkByIdOnly(chunkId);
        const content = res.data?.content?.trim();
        if (content) {
          setCache(chunkId, { status: "ok", content });
        } else {
          setCache(chunkId, { status: "err", message: "未找到片段内容" });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "加载失败";
        setCache(chunkId, { status: "err", message: msg });
      }
    })();
  }, [chunkId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setHoverOpen(next);
      if (next) load();
    },
    [load],
  );

  return (
    <HoverCard
      open={hoverOpen}
      onOpenChange={handleOpenChange}
      closeDelay={200}
      openDelay={80}
    >
      <HoverCardTrigger asChild>
        <CitationPill
          ref={triggerRef}
          className={className}
          title={docTitle?.trim() || chunkId}
          onClick={(e) => {
            e.preventDefault();
            if (hoverOpen) return;
            handleOpenChange(true);
          }}
        >
          {(children ?? docTitle?.trim()) || chunkId}
        </CitationPill>
      </HoverCardTrigger>
      <HoverCardContent
        className={KB_CITATION_HOVER_CONTENT_CLASS}
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        onPointerDownOutside={preventCloseWhenPointerOnTrigger(triggerRef)}
        onInteractOutside={preventCloseWhenPointerOnTrigger(triggerRef)}
        onFocusOutside={preventCloseWhenPointerOnTrigger(triggerRef)}
      >
        <PopoverBody chunkId={chunkId} docTitle={docTitle} />
      </HoverCardContent>
    </HoverCard>
  );
}
