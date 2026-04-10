import { useState } from "react";
import { FileText, Loader2, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import type { WeKnoraKnowledge } from "@/api/weknora/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WeKnoraAddSourceDialog } from "./WeKnoraAddSourceDialog";

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const displayName = (k: WeKnoraKnowledge) =>
  (k.file_name || k.title || "").trim() || "未命名";

function knowledgeStatusFlags(parseStatus: string | undefined) {
  const s = (parseStatus ?? "").trim().toLowerCase();
  return {
    raw: (parseStatus ?? "").trim(),
    processing: s === "pending" || s === "processing",
    failed: s === "failed",
  };
}

type Props = {
  kbReady: boolean;
  rows: WeKnoraKnowledge[];
  loading: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchOpen: boolean;
  onSearchOpenToggle: () => void;
  selectedId: string | null;
  onSelect: (k: WeKnoraKnowledge) => void;
  uploading: boolean;
  onDelete: (k: WeKnoraKnowledge) => void;
  onDownload: (k: WeKnoraKnowledge) => void;
  kbId: string;
  onAdded: () => void;
};

export function WeKnoraKnowledgeSidebar(props: Props) {
  const {
    kbReady,
    rows,
    loading,
    searchQuery,
    onSearchQueryChange,
    searchOpen,
    onSearchOpenToggle,
    selectedId,
    onSelect,
    uploading,
    onDelete,
    onDownload,
    kbId,
    onAdded,
  } = props;

  const [dialogOpen, setDialogOpen] = useState(false);
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => displayName(r).toLowerCase().includes(q))
    : rows;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-foreground text-sm font-semibold tracking-tight">资料</h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="搜索"
            onClick={onSearchOpenToggle}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 transition-colors hover:bg-[#E5E5E5]"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="添加来源"
            disabled={!kbReady || uploading}
            onClick={() => setDialogOpen(true)}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 transition-colors hover:bg-[#E5E5E5] disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {searchOpen ? (
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="筛选文档…"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground shrink-0 rounded-lg border px-2.5 py-1.5 text-xs focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      ) : null}
      <p className="text-muted-foreground shrink-0 text-[11px] leading-snug">
        上传到当前项目的知识库；对话将按后端策略检索这些资料。
      </p>
      {!kbReady && (
        <p className="text-muted-foreground shrink-0 text-xs">该项目未关联知识库，无法上传。</p>
      )}
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {loading && <li className="text-muted-foreground px-1 py-2 text-xs">加载中…</li>}
        {!loading &&
          filtered.map((k) => {
            const active = selectedId === k.id;
            const { raw: statusRaw, processing, failed } = knowledgeStatusFlags(k.parse_status);
            return (
              <li key={k.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-xl px-2 py-2 text-left text-sm transition-colors cursor-pointer",
                    active ? "bg-[#E0E0E0] font-medium" : "hover:bg-muted/80",
                    processing &&
                      "bg-amber-500/[0.06] ring-1 ring-amber-500/25 ring-inset dark:bg-amber-400/[0.08] dark:ring-amber-400/20",
                  )}
                  onClick={() => onSelect(k)}
                  aria-busy={processing}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <FileText
                      className={cn(
                        "h-4 w-4 shrink-0",
                        processing ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{displayName(k)}</span>
                    {statusRaw ? (
                      processing ? (
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            "border-amber-500/40 bg-amber-500/12 text-amber-900 shadow-sm",
                            "dark:border-amber-400/35 dark:bg-amber-400/15 dark:text-amber-50",
                          )}
                        >
                          <Loader2
                            className="h-3 w-3 shrink-0 animate-spin text-amber-700 dark:text-amber-200"
                            aria-hidden
                          />
                          {statusRaw}
                        </span>
                      ) : failed ? (
                        <span className="text-destructive shrink-0 text-[10px] font-medium uppercase">
                          {statusRaw}
                        </span>
                      ) : (
                        <span className="text-muted-foreground shrink-0 text-[10px] uppercase">{statusRaw}</span>
                      )
                    ) : null}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                    {formatFileSize(k.file_size)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground shrink-0 rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="更多"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelect(k); }}>查看详情</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(k); }}>下载</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDelete(k); }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        {!loading && kbReady && rows.length === 0 && (
          <li className="text-muted-foreground px-1 py-2 text-xs">暂无文件，点击「+」上传。</li>
        )}
        {!loading && kbReady && rows.length > 0 && filtered.length === 0 && (
          <li className="text-muted-foreground px-1 py-2 text-xs">无匹配文档。</li>
        )}
      </ul>

      <WeKnoraAddSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kbId={kbId}
        disabled={uploading}
        onAdded={onAdded}
      />
    </div>
  );
}
