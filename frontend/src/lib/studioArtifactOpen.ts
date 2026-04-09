import { apiFetchBlob } from "@/api/http";

/** Provider path for `GET /files?file_path=` (e.g. `local://…`, `minio://…`). */
export function studioArtifactFilePath(payload: Record<string, unknown>): string | null {
  const fp = payload.file_path;
  if (typeof fp === "string" && fp.trim().length > 0) return fp.trim();
  const fu = payload.file_url;
  if (typeof fu === "string" && fu.trim().length > 0) return fu.trim();
  return null;
}

/**
 * Opens a Studio artifact: presigned HTTPS in a new tab, or fetches `/files` with JWT and opens a blob URL.
 */
export async function openStudioArtifact(payload: Record<string, unknown>): Promise<void> {
  const fu = payload.file_url;
  if (typeof fu === "string") {
    const t = fu.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) {
      window.open(t, "_blank", "noopener,noreferrer");
      return;
    }
  }

  const fp = studioArtifactFilePath(payload);
  if (!fp) {
    throw new Error("没有可用的文件路径");
  }

  const q = `/files?file_path=${encodeURIComponent(fp)}`;
  const blob = await apiFetchBlob(q);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}
