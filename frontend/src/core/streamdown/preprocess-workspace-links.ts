/**
 * Turn workspace-relative file mentions (e.g. `./report.html`) into markdown links that hit
 * GET /api/v1/sessions/:id/workspace-file?path=...
 */
export function preprocessWorkspaceArtifactLinks(markdown: string, sessionId: string | null): string {
  if (!sessionId?.trim() || !markdown) return markdown;
  const sid = sessionId.trim();
  const base = `/api/v1/sessions/${encodeURIComponent(sid)}/workspace-file`;

  let s = markdown;
  // ./foo.html style (most common from agent write_file summaries)
  s = s.replace(
    /(^|[\s:：,，。（(「『【\n])(\.\/[a-zA-Z0-9_.\-/]+\.(?:html?|md|markdown|pptx?|pdf))(?=\s|$|[，,。）)\]】』」])/g,
    (match, pre: string, fp: string) => `${pre}[${fp}](${base}?path=${encodeURIComponent(fp)})`,
  );
  // /mnt/user-data/... virtual paths
  s = s.replace(
    /(^|[\s:：,，。（(「『【\n])(\/mnt\/user-data\/[^\s`"'<>[\]】』」）]+)/g,
    (match, pre: string, fp: string) => {
      if (/\]\([^)]+\)/.test(match)) return match;
      return `${pre}[${fp}](${base}?path=${encodeURIComponent(fp)})`;
    },
  );
  return s;
}
