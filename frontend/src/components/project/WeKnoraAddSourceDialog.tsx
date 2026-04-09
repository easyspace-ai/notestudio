"use client";

import { useMutation } from "@tanstack/react-query";
import { FileText, Link2, FileInput } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import * as knowledgeApi from "@/api/weknora/knowledge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type TabKey = "upload" | "paste" | "url";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kbId: string;
  disabled?: boolean;
  onAdded: () => void;
};

export function WeKnoraAddSourceDialog({
  open,
  onOpenChange,
  kbId,
  disabled = false,
  onAdded,
}: Props) {
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabKey>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Paste form state
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");

  // URL form state
  const [urlValue, setUrlValue] = useState("");
  const [urlTitle, setUrlTitle] = useState("");

  const resetForms = useCallback(() => {
    setFormError(null);
    setDragOver(false);
    setPasteTitle("");
    setPasteContent("");
    setUrlValue("");
    setUrlTitle("");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) resetForms();
      onOpenChange(next);
    },
    [onOpenChange, resetForms],
  );

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!kbId) throw new Error("知识库未就绪");
      for (const file of files) {
        await knowledgeApi.uploadKnowledgeFile(kbId, file);
      }
    },
    onSuccess: () => {
      onAdded();
      handleClose(false);
    },
    onError: (e) => {
      setFormError(e instanceof Error ? e.message : "上传失败");
    },
  });

  // Paste text mutation
  const pasteMutation = useMutation({
    mutationFn: async () => {
      if (!kbId) throw new Error("知识库未就绪");
      const title = pasteTitle.trim() || "笔记";
      const content = pasteContent.trim();
      if (!content) throw new Error("请输入内容");
      await knowledgeApi.createKnowledgeFromText(kbId, { title, content });
    },
    onSuccess: () => {
      onAdded();
      handleClose(false);
    },
    onError: (e) => {
      setFormError(e instanceof Error ? e.message : "添加失败");
    },
  });

  // URL import mutation
  const urlMutation = useMutation({
    mutationFn: async () => {
      if (!kbId) throw new Error("知识库未就绪");
      const url = urlValue.trim();
      if (!url) throw new Error("请输入网址");
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("网址必须以 http:// 或 https:// 开头");
      }
      await knowledgeApi.importKnowledgeFromUrl(kbId, {
        url,
        title: urlTitle.trim() || undefined,
        file_name: urlTitle.trim() || undefined,
      });
    },
    onSuccess: () => {
      onAdded();
      handleClose(false);
    },
    onError: (e) => {
      setFormError(e instanceof Error ? e.message : "导入失败");
    },
  });

  const busy = uploadMutation.isPending || pasteMutation.isPending || urlMutation.isPending;

  const onPickFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled || !kbId) return;
      setFormError(null);
      uploadMutation.mutate(Array.from(list));
    },
    [disabled, kbId, uploadMutation],
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="border-border border-b px-6 py-4 text-left">
          <DialogTitle>添加来源</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as TabKey);
              setFormError(null);
            }}
            className="w-full"
          >
            <TabsList variant="line" className="mb-4 h-auto w-full justify-start gap-6 bg-transparent p-0">
              <TabsTrigger value="upload" className="rounded-none px-0 pb-2 text-sm">
                <FileText className="mr-1.5 h-4 w-4" />
                上传文件
              </TabsTrigger>
              <TabsTrigger value="paste" className="rounded-none px-0 pb-2 text-sm">
                <FileInput className="mr-1.5 h-4 w-4" />
                粘贴文本
              </TabsTrigger>
              <TabsTrigger value="url" className="rounded-none px-0 pb-2 text-sm">
                <Link2 className="mr-1.5 h-4 w-4" />
                网址
              </TabsTrigger>
            </TabsList>

            {formError ? (
              <p className="text-destructive mb-3 text-xs">{formError}</p>
            ) : null}

            {/* Upload File Tab */}
            <TabsContent value="upload" className="mt-0 pb-6">
              <input
                ref={fileRef}
                id={fileInputId}
                type="file"
                multiple
                className="sr-only"
                disabled={disabled || !kbId || busy}
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <div
                role="button"
                tabIndex={disabled || !kbId ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  onPickFiles(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30",
                  (disabled || !kbId) && "pointer-events-none opacity-50",
                )}
              >
                <FileText className="text-emerald-600 mb-3 h-10 w-10" strokeWidth={1.25} />
                <p className="text-foreground text-center text-sm font-medium">
                  拖放文件到此处或点击浏览
                </p>
                <p className="text-muted-foreground mt-2 max-w-sm text-center text-xs leading-relaxed">
                  支持 PDF、图片、音频、视频、Office 文档（PDF、DOCX、XLSX、PPTX、TXT、MD 等）
                </p>
                {uploadMutation.isPending ? <p className="text-muted-foreground mt-3 text-xs">上传中…</p> : null}
              </div>
            </TabsContent>

            {/* Paste Text Tab */}
            <TabsContent value="paste" className="mt-0 space-y-4 pb-6">
              <div className="space-y-1.5">
                <label htmlFor="paste-title" className="text-sm font-medium">
                  标题
                </label>
                <Input
                  id="paste-title"
                  placeholder="输入标题（将作为文件名）"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="paste-content" className="text-sm font-medium">
                  内容 <span className="text-muted-foreground text-xs">（支持 Markdown 格式）</span>
                </label>
                <textarea
                  id="paste-content"
                  placeholder="在此粘贴或输入内容…"
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  disabled={busy}
                  rows={10}
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[200px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={busy}>
                  取消
                </Button>
                <Button
                  type="button"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={busy || !pasteContent.trim()}
                  onClick={() => {
                    setFormError(null);
                    pasteMutation.mutate();
                  }}
                >
                  {pasteMutation.isPending ? "保存中…" : "保存到知识库"}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* URL Import Tab */}
            <TabsContent value="url" className="mt-0 space-y-4 pb-6">
              <div className="space-y-1.5">
                <label htmlFor="url-value" className="text-sm font-medium">
                  网页地址
                </label>
                <Input
                  id="url-value"
                  type="url"
                  placeholder="https://example.com/article"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  disabled={busy}
                />
                <p className="text-muted-foreground text-xs">
                  系统将自动获取网页内容并转换为 Markdown 格式存入知识库
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="url-title" className="text-sm font-medium">
                  标题 <span className="text-muted-foreground text-xs">（可选）</span>
                </label>
                <Input
                  id="url-title"
                  placeholder="自定义标题（留空将使用网页标题）"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  disabled={busy}
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={busy}>
                  取消
                </Button>
                <Button
                  type="button"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={busy || !urlValue.trim()}
                  onClick={() => {
                    setFormError(null);
                    urlMutation.mutate();
                  }}
                >
                  {urlMutation.isPending ? "导入中…" : "导入网页"}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
