import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { StudioMaterial } from "@/api/chatclaw";
import * as agentsApi from "@/api/weknora/agents";
import * as knowledgeApi from "@/api/weknora/knowledge";
import * as projectsApi from "@/api/weknora/projects";
import * as sessionsApi from "@/api/weknora/sessions";
import * as studioApi from "@/api/weknora/studio";
import { ApiError } from "@/api/http";
import type { WeKnoraKnowledge } from "@/api/weknora/types";
import { NotebookShell, type NotebookWorkbenchTab } from "@/components/layout/NotebookShell";
import { WeKnoraKnowledgePreviewPane } from "@/components/project/WeKnoraKnowledgePreview";
import { WeKnoraKnowledgeSidebar } from "@/components/project/WeKnoraKnowledgeSidebar";
import { openStudioArtifact } from "@/lib/studioArtifactOpen";
import { weknoraStudioJobToMaterial } from "@/lib/weknoraStudioMaterial";
import { cn } from "@/lib/utils";
import { WeKnoraChatDock } from "@/components/project/WeKnoraChatDock";
import { StudioPanel } from "@/components/workspace/StudioPanel";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function WeKnoraProjectPage() {
  const params = useParams<{ projectUuid?: string; projectId?: string }>();
  const uuid = (params.projectUuid ?? params.projectId ?? "").trim();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const autoCreateRef = useRef(false);
  const [workbenchTab, setWorkbenchTab] = useState<NotebookWorkbenchTab>("对话");
  const [previewKnowledge, setPreviewKnowledge] = useState<WeKnoraKnowledge | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docSearchOpen, setDocSearchOpen] = useState(false);

  const project = useQuery({
    queryKey: ["weknora-project", uuid],
    queryFn: () => projectsApi.getProjectByUuid(uuid),
    enabled: UUID_RE.test(uuid),
  });

  const kbId = project.data?.knowledge_base_id?.trim() ?? "";
  const kbReady = kbId.length > 0;

  const knowledgeList = useQuery({
    queryKey: ["weknora-knowledge", kbId],
    queryFn: () => knowledgeApi.listKnowledge(kbId, { page: 1, page_size: 100 }),
    enabled: UUID_RE.test(uuid) && kbReady,
  });

  const knowledgeRows = knowledgeList.data?.data ?? [];
  const knowledgeTitles = knowledgeRows
    .map((k) => (k.file_name || k.title || "").trim())
    .filter(Boolean);

  const uploadKnowledge = useMutation({
    mutationFn: async (file: File) => knowledgeApi.uploadKnowledgeFile(kbId, file),
    onSuccess: () => {
      toast.success("上传成功");
      void qc.invalidateQueries({ queryKey: ["weknora-knowledge", kbId] });
    },
    onError: (e: Error) => toast.error(e.message || "上传失败"),
  });

  const deleteKnowledge = useMutation({
    mutationFn: (id: string) => knowledgeApi.deleteKnowledge(id),
    onSuccess: (_, id) => {
      toast.success("已删除");
      setPreviewKnowledge((prev) => (prev?.id === id ? null : prev));
      void qc.invalidateQueries({ queryKey: ["weknora-knowledge", kbId] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const handleWorkbenchTabChange = useCallback((tab: NotebookWorkbenchTab) => {
    setWorkbenchTab(tab);
    if (tab === "对话") {
      setPreviewKnowledge(null);
    }
  }, []);

  const agents = useQuery({
    queryKey: ["weknora-agents"],
    queryFn: () => agentsApi.listAgents(),
  });

  useEffect(() => {
    const list = agents.data;
    if (!list?.length) return;
    if (!agentId || !list.some((a) => a.id === agentId)) {
      setAgentId(list[0]!.id);
    }
  }, [agents.data, agentId]);

  const sessions = useQuery({
    queryKey: ["weknora-sessions", uuid],
    queryFn: () => sessionsApi.listSessions(1, 100, { projectUuid: uuid }),
    enabled: UUID_RE.test(uuid),
  });

  const studioJobs = useQuery({
    queryKey: ["weknora-studio-jobs", uuid],
    queryFn: () => studioApi.listStudioJobs(uuid, 1, 100),
    enabled: UUID_RE.test(uuid) && Boolean(project.data?.id),
    refetchInterval: (q) => {
      const rows = q.state.data?.data ?? [];
      return rows.some((j) => j.status === "pending" || j.status === "running") ? 2500 : false;
    },
  });

  const studioMaterials = useMemo((): StudioMaterial[] => {
    const pid = project.data?.id;
    const rows = studioJobs.data?.data ?? [];
    if (!pid || rows.length === 0) return [];
    return rows.map((j) => weknoraStudioJobToMaterial(j, pid));
  }, [project.data?.id, studioJobs.data?.data]);

  const createSession = useMutation({
    mutationFn: async () => {
      const s = await sessionsApi.createSession({
        title: "新对话",
        project_uuid: uuid,
      });
      return s;
    },
    onSuccess: (s) => {
      setSessionId(s.id);
      void qc.invalidateQueries({ queryKey: ["weknora-sessions", uuid] });
    },
    onError: (e: Error) => toast.error(e.message || "创建会话失败"),
  });

  const onPickSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  // Sort sessions by created_at descending (newest first)
  const sortedSessions = useMemo(() => {
    const rows = sessions.data?.data ?? [];
    return [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sessions.data?.data]);

  // Generate session title after first message exchange
  const generateTitle = useMutation({
    mutationFn: async ({
      sessionId: sid,
      messages,
    }: {
      sessionId: string;
      messages: { role: string; content: string }[];
    }) => {
      const title = await sessionsApi.generateSessionTitle(sid, messages);
      return { sessionId: sid, title };
    },
    onSuccess: ({ sessionId: sid, title }) => {
      // Update the session title in the list
      void qc.invalidateQueries({ queryKey: ["weknora-sessions", uuid] });
    },
    onError: (e: Error) => {
      // Silently fail - title generation is not critical
      console.error("Failed to generate title:", e);
    },
  });

  const handleFirstMessageComplete = useCallback(
    (sid: string, messages: { role: string; content: string }[]) => {
      // Only generate title if session still has default name
      const session = sortedSessions.find((s) => s.id === sid);
      if (session && (!session.title || session.title === "新对话" || session.title.trim() === "")) {
        generateTitle.mutate({ sessionId: sid, messages });
      }
    },
    [sortedSessions, generateTitle],
  );

  const onQuickStudio = useCallback(
    async (kind: string, title: string) => {
      try {
        await studioApi.createStudioJob({
          kind,
          title,
          project_uuid: uuid,
          ...(sessionId ? { session_id: sessionId } : {}),
        });
        toast.success("Studio 任务已创建，生成完成后可在此查看");
        void qc.invalidateQueries({ queryKey: ["weknora-studio-jobs", uuid] });
      } catch (e) {
        if (e instanceof ApiError) {
          toast.error(e.message || "创建失败");
        } else {
          toast.error(e instanceof Error ? e.message : "请求失败");
        }
      }
    },
    [uuid, sessionId, qc],
  );

  const onSelectStudioMaterial = useCallback((m: StudioMaterial) => {
    const payload = m.payload && typeof m.payload === "object" ? (m.payload as Record<string, unknown>) : {};
    if (m.status !== "ready") {
      toast.message("生成未完成", { description: "请待状态为已就绪后再打开。" });
      return;
    }
    void openStudioArtifact(payload).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : "无法打开文件");
    });
  }, []);

  useEffect(() => {
    const rows = sessions.data?.data;
    if (!rows?.length) return;
    if (!sessionId || !rows.some((r) => r.id === sessionId)) {
      setSessionId(rows[0]!.id);
    }
  }, [sessions.data, sessionId]);

  useEffect(() => {
    if (!UUID_RE.test(uuid)) return;
    if (sessions.isLoading || sessions.isError) return;
    const rows = sessions.data?.data ?? [];
    if (rows.length === 0 && !createSession.isPending && !autoCreateRef.current) {
      autoCreateRef.current = true;
      createSession.mutate();
    }
  }, [uuid, sessions.isLoading, sessions.isError, sessions.data, createSession.isPending, createSession.mutate]);

  if (!UUID_RE.test(uuid)) {
    return <Navigate to="/projects" replace />;
  }

  if (project.isError) {
    return (
      <div className="text-muted-foreground p-10 text-sm">
        无法加载项目，请返回项目列表重试。
      </div>
    );
  }

  const chatColumn = (
    <WeKnoraChatDock
      sessionId={sessionId}
      knowledgeBaseId={kbId}
      agentId={agentId}
      onAgentChange={setAgentId}
      projectName={project.data?.name}
      knowledgeDocCount={knowledgeRows.length}
      knowledgeTitles={knowledgeTitles}
      onFirstMessageComplete={handleFirstMessageComplete}
    />
  );

  const studioColumn = (
    <StudioPanel
      materials={studioMaterials}
      materialsLoading={studioJobs.isLoading}
      onSelectMaterial={onSelectStudioMaterial}
      onQuickMaterial={onQuickStudio}
    />
  );

  const shellCenter =
    previewKnowledge != null ? (
      <WeKnoraKnowledgePreviewPane
        knowledge={previewKnowledge}
        embedded
        onClose={() => setPreviewKnowledge(null)}
      />
    ) : (
      chatColumn
    );

  const shellRight = previewKnowledge != null ? chatColumn : studioColumn;

  const leftPanelMaterials = (
    <WeKnoraKnowledgeSidebar
      kbReady={kbReady}
      rows={knowledgeRows}
      loading={knowledgeList.isLoading}
      searchQuery={docSearchQuery}
      onSearchQueryChange={setDocSearchQuery}
      searchOpen={docSearchOpen}
      onSearchOpenToggle={() => setDocSearchOpen((v) => !v)}
      selectedId={previewKnowledge?.id ?? null}
      onSelect={(k) => setPreviewKnowledge(k)}
      uploading={uploadKnowledge.isPending}
      onDelete={(k) => {
        if (!window.confirm(`确定删除「${k.file_name || k.title || "该文件"}」？`)) return;
        deleteKnowledge.mutate(k.id);
      }}
      onDownload={(k) => {
        const name = (k.file_name || k.title || "download").trim();
        void knowledgeApi.downloadKnowledgeFile(k.id, name).catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : "下载失败");
        });
      }}
      kbId={kbId}
      onAdded={() => {
        void qc.invalidateQueries({ queryKey: ["weknora-knowledge", kbId] });
      }}
    />
  );

  const leftPanelConversations = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-0 py-0">
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          对话
        </span>
        <button
          type="button"
          className="hover:bg-muted inline-flex h-8 w-8 items-center justify-center rounded-lg"
          title="新对话"
          onClick={() => createSession.mutate()}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {sortedSessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPickSession(s.id)}
            className={cn(
              "mb-1 w-full truncate rounded-lg px-2 py-2 text-left text-sm",
              sessionId === s.id ? "bg-[#E0E0E0] font-medium" : "hover:bg-muted/80",
            )}
          >
            {s.title?.trim() || "未命名对话"}
          </button>
        ))}
      </div>
    </div>
  );

  const leftByTab = {
    资料: leftPanelMaterials,
    对话: leftPanelConversations,
  };

  return (
    <NotebookShell
      logoHref="/"
      leftByTab={leftByTab}
      workbenchTab={workbenchTab}
      onWorkbenchTabChange={handleWorkbenchTabChange}
      center={shellCenter}
      right={shellRight}
    />
  );
}
