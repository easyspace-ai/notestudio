/** Mirrors frontend/src/utils/request tenant header logic for WeKnora API. */

const SELECTED_KEY = "weknora_selected_tenant_id";
const TENANT_KEY = "weknora_tenant";

export function getTenantIdHeader(): string | null {
  try {
    const selected = localStorage.getItem(SELECTED_KEY);
    const raw = localStorage.getItem(TENANT_KEY);
    if (!selected || !raw) return null;
    const def = JSON.parse(raw) as { id?: number | string };
    const defaultId = def?.id != null ? String(def.id) : null;
    if (defaultId != null && selected !== defaultId) {
      return selected;
    }
  } catch {
    /* ignore */
  }
  return null;
}
