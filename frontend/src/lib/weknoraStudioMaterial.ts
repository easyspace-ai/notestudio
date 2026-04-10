import type { StudioMaterial, StudioMaterialKind, StudioMaterialStatus } from "@/api/chatclaw";

import type { WeKnoraStudioJob } from "@/api/weknora/types";

function mapStatus(s: WeKnoraStudioJob["status"]): StudioMaterialStatus {
  switch (s) {
    case "pending":
      return "pending";
    case "running":
      return "processing";
    case "succeeded":
      return "ready";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/** Maps a WeKnora `studio_jobs` row to the shared Studio panel row shape. */
export function weknoraStudioJobToMaterial(job: WeKnoraStudioJob, projectId: string): StudioMaterial {
  const payload: Record<string, unknown> = {
    ...(job.artifacts && typeof job.artifacts === "object" ? job.artifacts : {}),
  };
  if (job.error_message) payload.error_message = job.error_message;
  if (job.artifact_path) payload.artifact_path = job.artifact_path;
  const fileUrl =
    typeof payload.file_url === "string"
      ? payload.file_url.trim()
      : typeof payload.fileUrl === "string"
        ? payload.fileUrl.trim()
        : "";
  if (fileUrl) {
    if (!payload.url) payload.url = fileUrl;
    if (!payload.file_url) payload.file_url = fileUrl;
  }

  let subtitle = "";
  if (job.status === "failed") subtitle = job.error_message?.trim() || "生成失败";
  else if (job.status === "succeeded" && (payload.file_url || payload.artifact_path)) subtitle = "已生成，可打开查看";

  return {
    id: job.id,
    created_at: job.created_at,
    updated_at: job.updated_at,
    project_id: projectId,
    kind: job.kind as StudioMaterialKind,
    title: job.title,
    status: mapStatus(job.status),
    subtitle,
    payload,
  };
}
