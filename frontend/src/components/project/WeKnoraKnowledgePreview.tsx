import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Streamdown } from "streamdown";
import type { WeKnoraKnowledge } from "@/api/weknora/types";
import { downloadKnowledgeFile, fetchKnowledgePreviewBlob, getKnowledge } from "@/api/weknora/knowledge";
import { streamdownPlugins } from "@/core/streamdown";
import { cn } from "@/lib/utils";

const PREVIEW_MAX_BYTES = 22 * 1024 * 1024;

function effectiveMime(fileName: string, blobType: string): string {
  const m = (blobType || "").split(";")[0]!.trim().toLowerCase();
  if (m && m !== "application/octet-stream") return blobType.split(";")[0]!.trim();
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function isTextualMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/xml" ||
    m.endsWith("+json") ||
    m.endsWith("+xml")
  );
}

const displayName = (k: WeKnoraKnowledge) =>
  (k.file_name || k.title || "").trim() || "未命名";

type Props = {
  knowledge: WeKnoraKnowledge;
  onClose: () => void;
  embedded?: boolean;
  className?: string;
};

type PreviewTab = "summary" | "original";

/**
 * 知识库文件预览（与 Vue 知识库 `/knowledge/:id/preview` 对齐）。
 */
export function WeKnoraKnowledgePreviewPane({
  knowledge,
  onClose,
  embedded = true,
  className,
}: Props) {
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>("summary");
  const [detail, setDetail] = useState<WeKnoraKnowledge | null>(null);

  const name = displayName(knowledge);
  const effectiveKnowledge = detail ?? knowledge;
  const summaryText = effectiveKnowledge.description?.trim() ?? "";
  const summaryStatus = (effectiveKnowledge.summary_status || "").trim().toLowerCase();
  const hasSummary = summaryText.length > 0;
  const summaryLoading = summaryStatus === "pending" || summaryStatus === "processing";
  const summaryFailed = summaryStatus === "failed";
  const canShowSummary = hasSummary || summaryLoading || summaryFailed;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    void getKnowledge(knowledge.id)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch(() => {
        /* fall back to list payload */
      });
    return () => {
      cancelled = true;
    };
  }, [knowledge.id]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setErr(null);
    setBlob(null);
    setTextContent(null);
    setObjectUrl(null);

    void (async () => {
      try {
        const b = await fetchKnowledgePreviewBlob(knowledge.id);
        if (cancelled) return;
        setBlob(b);
        const mime = effectiveMime(name, b.type);
        const needsObjectUrl =
          mime.startsWith("image/") ||
          mime === "application/pdf" ||
          mime.startsWith("audio/") ||
          mime.startsWith("video/") ||
          mime === "text/html";
        if (b.size > PREVIEW_MAX_BYTES) {
          return;
        }
        if (needsObjectUrl) {
          const url = URL.createObjectURL(b);
          setObjectUrl(url);
          return;
        }
        if (isTextualMime(mime) || mime === "application/octet-stream") {
          const t = await b.text();
          if (!cancelled) setTextContent(t);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [knowledge.id, name]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    setTab(canShowSummary ? "summary" : "original");
  }, [canShowSummary, knowledge.id]);

  const mime = blob ? effectiveMime(name, blob.type) : "";
  const tooLarge = blob != null && blob.size > PREVIEW_MAX_BYTES;

  const onDownload = () => {
    void downloadKnowledgeFile(knowledge.id, name).catch(() => {});
  };

  const scrollBox = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 py-4"
    : "min-h-0 flex-1 overflow-y-auto px-5 py-4";

  const summaryBody = useMemo<ReactNode>(() => {
    if (hasSummary) {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAFA] p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              文档总结
            </p>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
              {summaryText}
            </div>
          </div>
        </div>
      );
    }
    if (summaryLoading) {
      return (
        <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          总结生成中…
        </div>
      );
    }
    if (summaryFailed) {
      return <p className="text-muted-foreground py-6 text-sm">总结生成失败，可直接查看原文。</p>;
    }
    return <p className="text-muted-foreground py-6 text-sm">该资料暂时没有可展示的总结。</p>;
  }, [hasSummary, summaryFailed, summaryLoading, summaryText]);

  let body: ReactNode = null;
  if (tab === "summary") {
    body = summaryBody;
  } else if (busy) {
    body = (
      <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载预览…
      </div>
    );
  } else if (err) {
    body = <p className="text-destructive py-6 text-sm">{err}</p>;
  } else if (!blob) {
    body = <p className="text-muted-foreground py-6 text-sm">没有可预览的内容。</p>;
  } else if (tooLarge) {
    body = (
      <div className="space-y-3 py-4 text-sm">
        <p className="text-muted-foreground">
          文件较大（约 {(blob.size / (1024 * 1024)).toFixed(1)} MB），为避免浏览器卡顿，不在此内联预览。
        </p>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          下载到本地查看
        </button>
      </div>
    );
  } else if (mime.startsWith("image/") && objectUrl) {
    body = (
      <div className="flex min-h-0 flex-1 justify-center overflow-auto">
        <img src={objectUrl} alt={name} className="max-h-full max-w-full object-contain" />
      </div>
    );
  } else if (mime === "application/pdf" && objectUrl) {
    body = (
      <iframe
        title={name}
        src={objectUrl}
        className="h-[calc(100dvh-14rem)] min-h-[360px] w-full shrink-0 rounded-xl border border-black/[0.08]"
      />
    );
  } else if (mime.startsWith("audio/") && objectUrl) {
    body = <audio className="w-full" controls src={objectUrl} />;
  } else if (mime.startsWith("video/") && objectUrl) {
    body = <video className="max-h-full w-full rounded-xl" controls src={objectUrl} />;
  } else if (mime === "text/html" && objectUrl) {
    body = (
      <iframe title={name} src={objectUrl} sandbox="" className="h-[calc(100dvh-15rem)] min-h-[280px] w-full rounded-xl border border-black/[0.08]" />
    );
  } else if (textContent != null) {
    const looksBinary = textContent.includes("\0") && mime === "application/octet-stream";
    if (looksBinary) {
      body = (
        <p className="text-muted-foreground text-sm">
          二进制文件无法在浏览器中预览，请使用下载。
        </p>
      );
    } else if (mime === "text/markdown" || /\.(md|markdown)$/i.test(name)) {
      body = (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Streamdown className="text-sm leading-relaxed" {...streamdownPlugins}>
            {textContent}
          </Streamdown>
        </div>
      );
    } else {
      body = (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word rounded-xl border border-black/[0.08] bg-muted/30 p-4 text-xs leading-relaxed">
          {textContent}
        </pre>
      );
    }
  } else {
    body = (
      <p className="text-muted-foreground text-sm">
        不支持在线预览此类型（{mime || "未知"}），请下载查看。
      </p>
    );
  }

  const bodyWrap = embedded ? <div className="flex min-h-0 flex-1 flex-col">{body}</div> : body;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-white text-foreground",
        embedded && "h-full min-h-0 flex-1",
        className,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-black/[0.06] px-6 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">资料预览</p>
          <h2 className="mt-1 truncate text-base font-bold tracking-tight md:text-lg">{name}</h2>
          {tab === "original" && blob && !tooLarge ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {(blob.size / 1024).toFixed(1)} KB · {mime}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {effectiveKnowledge.parse_status === "completed"
                ? "已入库"
                : effectiveKnowledge.parse_status || "处理中"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-lg p-2 text-muted-foreground hover:bg-black/[0.06] hover:text-foreground"
            title="下载"
            aria-label="下载"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-black/[0.06] hover:text-foreground"
            aria-label="关闭预览"
            title="关闭预览"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-6 py-2">
        {canShowSummary ? (
          <button
            type="button"
            onClick={() => setTab("summary")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === "summary"
                ? "bg-black text-white"
                : "bg-black/[0.04] text-muted-foreground hover:bg-black/[0.08] hover:text-foreground",
            )}
          >
            总结
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setTab("original")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            tab === "original"
              ? "bg-black text-white"
              : "bg-black/[0.04] text-muted-foreground hover:bg-black/[0.08] hover:text-foreground",
          )}
        >
          原文
        </button>
      </div>
      <div className={scrollBox}>{bodyWrap}</div>
    </div>
  );
}
