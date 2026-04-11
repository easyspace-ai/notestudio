import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { StudioMaterial } from "@/api/chatclaw";
import * as agentsApi from "@/api/weknora/agents";
import * as knowledgeApi from "@/api/weknora/knowledge";
import * as projectsApi from "@/api/weknora/projects";
import * as sessionsApi from "@/api/weknora/sessions";
import * as studioApi from "@/api/weknora/studio";
import { ApiError } from "@/api/http";
import type { WeKnoraKnowledge, WeKnoraSession } from "@/api/weknora/types";
import { NotebookShell, type NotebookWorkbenchTab } from "@/components/layout/NotebookShell";
import { WeKnoraKnowledgePreviewPane } from "@/components/project/WeKnoraKnowledgePreview";
import { WeKnoraKnowledgeSidebar } from "@/components/project/WeKnoraKnowledgeSidebar";
import {
  weknoraSessionArtifactToMaterial,
  type WeKnoraSessionArtifact,
} from "@/lib/weknoraChatArtifacts";
import { weknoraStudioJobToMaterial } from "@/lib/weknoraStudioMaterial";
import { cn } from "@/lib/utils";
import { WeKnoraChatDock } from "@/components/project/WeKnoraChatDock";
import { StudioPanel } from "@/components/workspace/StudioPanel";
import {
  StudioMaterialExpandedOverlay,
  StudioMaterialPreviewPane,
} from "@/components/workspace/StudioMaterialDialog";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const activeSessionStorageKey = (projectUuid: string) => `weknora:active-session:${projectUuid}`;

function readStoredActiveSessionId(projectUuid: string): string | null {
  try {
    const v = sessionStorage.getItem(activeSessionStorageKey(projectUuid))?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeStoredActiveSessionId(projectUuid: string, sessionId: string | null) {
  try {
    const key = activeSessionStorageKey(projectUuid);
    if (sessionId && sessionId.length > 0) {
      sessionStorage.setItem(key, sessionId);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** Match backend `GetPagedByTenantID`: `ORDER BY updated_at DESC` (then stable id). */
function sortSessionsNewestFirst(rows: WeKnoraSession[]): WeKnoraSession[] {
  return [...rows].sort((a, b) => {
    const tb = new Date(b.updated_at || b.created_at).getTime();
    const ta = new Date(a.updated_at || a.created_at).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

export function WeKnoraProjectPage() {
  const params = useParams<{ projectUuid?: string; projectId?: string }>();
  const uuid = (params.projectUuid ?? params.projectId ?? "").trim();
  const [searchParams, setSearchParams] = useSearchParams();
  /** 仅追踪 session 片段，避免其它 query 变化时反复跑选会话逻辑 */
  const sessionFromUrl = searchParams.get("session")?.trim() ?? "";
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const autoCreateRef = useRef(false);
  const [workbenchTab, setWorkbenchTab] = useState<NotebookWorkbenchTab>("对话");
  const [previewKnowledge, setPreviewKnowledge] = useState<WeKnoraKnowledge | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  /** 右栏内联预览 Studio 产物（与 NotebookShell 右栏同宽，可再点「放大」居中浮层） */
  const [studioSidebarMaterial, setStudioSidebarMaterial] = useState<StudioMaterial | null>(null);
  const [studioExpandOpen, setStudioExpandOpen] = useState(false);
  /** 对话中识别的 HTML/Markdown/工具输出文件，与异步 Studio 任务一并显示在右侧 */
  const [sessionChatArtifacts, setSessionChatArtifacts] = useState<WeKnoraSessionArtifact[]>([]);

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
    refetchInterval: (q) => {
      const rows = q.state.data?.data ?? [];
      const hasInFlight = rows.some((k) => {
        const s = (k.parse_status ?? "").trim().toLowerCase();
        return s === "pending" || s === "processing";
      });
      return hasInFlight ? 2500 : false;
    },
  });

  const knowledgeRows = knowledgeList.data?.data ?? [];

  // Convert knowledge rows to simple format for chat dock @ mentions
  const knowledgeDocsForChat = useMemo(() => {
    return knowledgeRows.map((k) => ({
      id: k.id,
      title: k.file_name || k.title || "未命名",
    }));
  }, [knowledgeRows]);

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
      setStudioSidebarMaterial(null);
      setStudioExpandOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!studioSidebarMaterial || studioExpandOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setStudioSidebarMaterial(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studioSidebarMaterial, studioExpandOpen]);

  const agents = useQuery({
    queryKey: ["weknora-agents"],
    queryFn: () => agentsApi.listAgents(),
  });

  // 过滤掉内置 Agent，只保留自定义 Agent
  const customAgents = useMemo(() => {
    return (agents.data ?? []).filter(agent => !agent.is_builtin);
  }, [agents.data]);

  useEffect(() => {
    if (!customAgents.length) return;
    if (!agentId || !customAgents.some((a) => a.id === agentId)) {
      setAgentId(customAgents[0]!.id);
    }
  }, [customAgents, agentId]);

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

  /** Shared with 魔棒 + Studio 侧栏，避免重复请求且列表一致。 */
  const studioQuickSkills = useQuery({
    queryKey: ["weknora-studio-quick-skills", agentId],
    queryFn: () => studioApi.fetchStudioQuickSkills(agentId!),
    enabled: agentId != null && agentId.length > 0,
    staleTime: 60_000,
  });

  const studioMaterials = useMemo((): StudioMaterial[] => {
    const pid = project.data?.id;
    const rows = studioJobs.data?.data ?? [];
    if (!pid || rows.length === 0) return [];
    return rows.map((j) => weknoraStudioJobToMaterial(j, pid));
  }, [project.data?.id, studioJobs.data?.data]);

  const mergedStudioMaterials = useMemo((): StudioMaterial[] => {
    const pid = project.data?.id?.trim() ? String(project.data.id) : "";
    const fromChat = sessionChatArtifacts.map((a) =>
      weknoraSessionArtifactToMaterial(a, pid || "local", sessionId),
    );
    return [...fromChat, ...studioMaterials].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }, [sessionChatArtifacts, studioMaterials, project.data?.id, sessionId]);

  useEffect(() => {
    setSessionChatArtifacts([]);
  }, [sessionId]);

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
      qc.setQueryData(["weknora-sessions", uuid], (prev) => {
        if (!prev || typeof prev !== "object") return prev;
        const p = prev as {
          data: WeKnoraSession[];
          total: number;
          page: number;
          page_size: number;
        };
        const rest = (p.data ?? []).filter((x) => x.id !== s.id);
        const isNew = rest.length === (p.data ?? []).length;
        const total = typeof p.total === "number" ? p.total : (p.data ?? []).length;
        return {
          ...p,
          data: [s, ...rest],
          total: isNew ? total + 1 : total,
        };
      });
      void qc.invalidateQueries({ queryKey: ["weknora-sessions", uuid] });
    },
    onError: (e: Error) => toast.error(e.message || "创建会话失败"),
  });

  const onPickSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const sortedSessions = useMemo(() => {
    const rows = sessions.data?.data ?? [];
    return sortSessionsNewestFirst(rows);
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
      // Save the generated title to the session
      await sessionsApi.updateSession(sid, { title });
      return { sessionId: sid, title };
    },
    onSuccess: ({ sessionId: sid, title }) => {
      // Update the session title in the list
      toast.success("会话标题已生成");
      void qc.invalidateQueries({ queryKey: ["weknora-sessions", uuid] });
    },
    onError: (e: Error) => {
      // Silently fail - title generation is not critical
      console.error("Failed to generate title:", e);
    },
  });

  const handleFirstMessageComplete = useCallback(
    (sid: string, messages: { role: string; content: string }[]) => {
      const session = sortedSessions.find((s) => s.id === sid);
      const defaultTitle =
        !session?.title?.trim() || session.title === "新对话";
      // 新会话可能尚未出现在列表缓存中，仍应尝试生成标题
      if (defaultTitle) {
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

  const onQuickSkill = useCallback(
    async (kind: string, title: string) => {
      try {
        await studioApi.createStudioJob({
          kind,
          title,
          project_uuid: uuid,
          ...(sessionId ? { session_id: sessionId } : {}),
        });
        toast.success(`${title}生成任务已创建，完成后将显示在右侧边栏`);
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
    if (m.status !== "ready") {
      toast.message("生成未完成", { description: "请待状态为已就绪后再打开。" });
      return;
    }
    setStudioSidebarMaterial(m);
    setStudioExpandOpen(false);
  }, []);

  useEffect(() => {
    const rows = sessions.data?.data;
    if (!rows?.length) return;

    if (sessionId && rows.some((r) => r.id === sessionId)) {
      return;
    }

    if (!sessionId) {
      if (sessionFromUrl && rows.some((r) => r.id === sessionFromUrl)) {
        setSessionId(sessionFromUrl);
        return;
      }
      const stored = readStoredActiveSessionId(uuid);
      if (stored && rows.some((r) => r.id === stored)) {
        setSessionId(stored);
        return;
      }
      setSessionId(sortSessionsNewestFirst(rows)[0]!.id);
      return;
    }

    // 当前 id 不在列表里：可能是刚创建会话而列表缓存仍是 refetch 前的旧数据
    if (sessions.isFetching) {
      return;
    }

    if (sessionFromUrl && rows.some((r) => r.id === sessionFromUrl)) {
      setSessionId(sessionFromUrl);
      return;
    }
    const stored = readStoredActiveSessionId(uuid);
    if (stored && rows.some((r) => r.id === stored)) {
      setSessionId(stored);
      return;
    }
    setSessionId(sortSessionsNewestFirst(rows)[0]!.id);
  }, [sessions.data, sessions.isFetching, sessionId, uuid, sessionFromUrl]);

  useEffect(() => {
    if (!UUID_RE.test(uuid) || !sessionId) return;
    writeStoredActiveSessionId(uuid, sessionId);
  }, [uuid, sessionId]);

  /** 将当前会话同步到 URL，刷新/分享链接仍可打开同一会话（优于仅 sessionStorage）。 */
  useEffect(() => {
    if (!UUID_RE.test(uuid) || !sessionId) return;
    setSearchParams(
      (prev) => {
        if (prev.get("session") === sessionId) {
          return prev;
        }
        const next = new URLSearchParams(prev);
        next.set("session", sessionId);
        return next;
      },
      { replace: true },
    );
  }, [uuid, sessionId, setSearchParams]);

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

  const studioQuickFromParent =
    agentId != null && agentId.length > 0
      ? {
          items: studioQuickSkills.data?.items ?? [],
          isLoading: studioQuickSkills.isPending || studioQuickSkills.isFetching,
          isError: studioQuickSkills.isError,
        }
      : undefined;

  const chatColumn = (
    <WeKnoraChatDock
      sessionId={sessionId}
      knowledgeBaseId={kbId}
      agentId={agentId}
      onAgentChange={setAgentId}
      projectName={project.data?.name}
      onFirstMessageComplete={handleFirstMessageComplete}
      onQuickSkill={onQuickSkill}
      studioQuickSkillsFromParent={studioQuickFromParent}
      onSessionArtifacts={setSessionChatArtifacts}
      knowledgeDocs={knowledgeDocsForChat}
    />
  );

  const studioColumn = (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      {studioSidebarMaterial ? (
        <StudioMaterialPreviewPane
          variant="sidebar"
          material={studioSidebarMaterial}
          projectId={project.data?.id ? String(project.data.id) : undefined}
          onClose={() => {
            setStudioSidebarMaterial(null);
            setStudioExpandOpen(false);
          }}
          onExpand={() => setStudioExpandOpen(true)}
        />
      ) : (
        <StudioPanel
          materials={mergedStudioMaterials}
          materialsLoading={studioJobs.isLoading}
          onSelectMaterial={onSelectStudioMaterial}
          onQuickMaterial={onQuickStudio}
          studioQuickItems={agentId != null && agentId.length > 0 ? (studioQuickSkills.data?.items ?? []) : undefined}
          studioQuickLoading={Boolean(agentId && (studioQuickSkills.isPending || studioQuickSkills.isFetching))}
          studioQuickFetchError={Boolean(agentId && studioQuickSkills.isError)}
        />
      )}
    </div>
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
    <>
      <NotebookShell
        logoHref="/"
        leftByTab={leftByTab}
        workbenchTab={workbenchTab}
        onWorkbenchTabChange={handleWorkbenchTabChange}
        center={shellCenter}
        right={shellRight}
      />
      <StudioMaterialExpandedOverlay
        projectId={project.data?.id ? String(project.data.id) : undefined}
        material={studioSidebarMaterial}
        open={studioExpandOpen}
        onMinimize={() => setStudioExpandOpen(false)}
        onCloseAll={() => {
          setStudioExpandOpen(false);
          setStudioSidebarMaterial(null);
        }}
      />
    </>
  );
}
