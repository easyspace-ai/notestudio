/** Synthetic markdown link target; resolved by `WeKnoraMarkdownAnchor` → `KbCitationLink`. */
export const WKNORA_KB_HREF_PREFIX = "weknora-kb:" as const;

/** Doc-level resolve (no chunk id in model output); hover loads first chunk via knowledge id. */
export const WKNORA_KB_DOC_HREF_PREFIX = "weknora-kb-doc:" as const;

export type WeKnoraKbDocPayload = {
  knowledgeId: string;
  docTitle: string;
};

/** Normalized lookup value for {@link buildKnowledgeFileIndex}. */
export type WeKnoraKbDocEntry = {
  knowledgeId: string;
  displayTitle: string;
};

export type WeKnoraKbLinkPayload = {
  doc: string;
  chunkId: string;
  kbId?: string;
};

const ATTRIBUTE_REGEX = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;

function parseTagAttributes(attrString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (!attrString.trim()) return attributes;
  ATTRIBUTE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_REGEX.exec(attrString)) !== null) {
    const key = (match[1] || match[3] || "").toLowerCase();
    const value = match[2] ?? match[4] ?? "";
    attributes[key] = value;
  }
  return attributes;
}

export function parseWeKnoraKbHref(href: string): WeKnoraKbLinkPayload | null {
  if (!href.startsWith(WKNORA_KB_HREF_PREFIX)) return null;
  try {
    const json = decodeURIComponent(href.slice(WKNORA_KB_HREF_PREFIX.length));
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    const chunkId = rec.chunkId;
    if (typeof chunkId !== "string" || !chunkId.trim()) return null;
    const doc = typeof rec.doc === "string" ? rec.doc : "";
    const kbId = typeof rec.kbId === "string" ? rec.kbId : undefined;
    return { doc: doc || chunkId, chunkId: chunkId.trim(), kbId };
  } catch {
    return null;
  }
}

export function parseWeKnoraKbDocHref(href: string): WeKnoraKbDocPayload | null {
  if (!href.startsWith(WKNORA_KB_DOC_HREF_PREFIX)) {
    return null;
  }
  try {
    const json = decodeURIComponent(href.slice(WKNORA_KB_DOC_HREF_PREFIX.length));
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== "object") {
      return null;
    }
    const rec = o as Record<string, unknown>;
    const knowledgeId = rec.knowledgeId;
    const docTitle = rec.docTitle;
    if (typeof knowledgeId !== "string" || !knowledgeId.trim()) {
      return null;
    }
    return {
      knowledgeId: knowledgeId.trim(),
      docTitle: typeof docTitle === "string" ? docTitle : "",
    };
  } catch {
    return null;
  }
}

function truncateMiddle(text: string, maxLength = 13): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const inner = maxLength - 3;
  const half = Math.floor(inner / 2);
  const start = text.slice(0, half + (inner % 2));
  const end = text.slice(-half);
  return `${start}...${end}`;
}

/** Escape `]` and `\` for CommonMark link labels. */
function escapeMarkdownLinkLabel(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MD_LINK_SPLIT_RE = /(\[[^\]]+\]\([^)]+\))/g;

function transformPlainTextChunk(
  chunk: string,
  index: Map<string, WeKnoraKbDocEntry>,
): string {
  let s = chunk;

  s = s.replace(/《([^》]{1,400})》/g, (full, inner: string) => {
    const hit = lookupKbDoc(index, inner);
    if (!hit) {
      return full;
    }
    const innerTrim = inner.trim();
    const link = buildKbDocMarkdownLink(hit, innerTrim);
    return link || full;
  });

  const uniqueByKnowledge = new Map<string, WeKnoraKbDocEntry>();
  for (const v of index.values()) {
    if (!uniqueByKnowledge.has(v.knowledgeId)) {
      uniqueByKnowledge.set(v.knowledgeId, v);
    }
  }
  const sorted = [...uniqueByKnowledge.values()].sort(
    (a, b) => b.displayTitle.length - a.displayTitle.length,
  );

  for (const entry of sorted) {
    const display = entry.displayTitle;
    if (display.length < 2) {
      continue;
    }
    const re = new RegExp(`(?<![\\w/])${escapeRegExp(display)}(?![\\w/.])`, "gi");
    s = s.replace(re, (match) => {
      const hit = lookupKbDoc(index, match) ?? entry;
      const link = buildKbDocMarkdownLink(hit, match);
      return link || match;
    });
  }

  return s;
}

/**
 * Build a case-insensitive lookup from current KB file list (project sidebar / @mention list).
 * Keys: lowercased display names (file_name and title).
 */
export function buildKnowledgeFileIndex(
  docs: Array<{ id: string; title: string }>,
): Map<string, WeKnoraKbDocEntry> {
  const m = new Map<string, WeKnoraKbDocEntry>();
  for (const d of docs) {
    const display = (d.title || "").trim();
    if (!display) {
      continue;
    }
    const entry: WeKnoraKbDocEntry = { knowledgeId: d.id, displayTitle: display };
    m.set(display.toLowerCase(), entry);
    const base = display.split(/[/\\]/).pop();
    if (base && base !== display) {
      m.set(base.toLowerCase(), entry);
    }
  }
  return m;
}

function lookupKbDoc(index: Map<string, WeKnoraKbDocEntry>, raw: string): WeKnoraKbDocEntry | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const direct = index.get(t.toLowerCase());
  if (direct) {
    return direct;
  }
  const lower = t.toLowerCase();
  for (const [, v] of index) {
    const d = v.displayTitle.toLowerCase();
    if (d === lower || lower.endsWith(d) || d.endsWith(lower)) {
      return v;
    }
  }
  return null;
}

function buildKbDocMarkdownLink(entry: WeKnoraKbDocEntry, labelSource: string): string {
  const label = escapeMarkdownLinkLabel(truncateMiddle(labelSource));
  const payload: WeKnoraKbDocPayload = {
    knowledgeId: entry.knowledgeId,
    docTitle: entry.displayTitle,
  };
  try {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `[${label}](${WKNORA_KB_DOC_HREF_PREFIX}${encoded})`;
  } catch {
    return "";
  }
}

/**
 * When the model writes file names as plain text (e.g. `obsidian.md`, `《OpenClaw (1).txt》`)
 * instead of `<kb …/>`, map known project files to `weknora-kb-doc:` links for pill UI.
 */
export function preprocessKbPlainDocNames(
  markdown: string,
  index: Map<string, WeKnoraKbDocEntry>,
): string {
  if (!markdown || index.size === 0) {
    return markdown;
  }

  const parts = markdown.split(MD_LINK_SPLIT_RE);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : transformPlainTextChunk(part, index)))
    .join("");
}

/** Decode entities inside a captured kb tag fragment (order: named entities before &amp;). */
function decodeBasicEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}


/** UUID v4 (and relaxed hex variants) — used when the model puts chunk id in `doc` only. */
const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(s: string): boolean {
  return UUID_LIKE.test(s.trim());
}

/**
 * Resolve chunk id + human title. Supports:
 * - `<kb doc="书名" chunk_id="uuid" />`
 * - `<kb doc="uuid" />` (id only in doc — common when chunk_id is omitted)
 * - `<kb chunk_id="uuid" />`
 */
function resolveKbChunkAndTitle(attrs: Record<string, string>): {
  chunkId: string;
  displayTitle: string;
  kbId?: string;
} | null {
  let rawDoc = (attrs.doc || "").trim();
  const rawChunk =
    attrs.chunk_id ||
    attrs.chunkid ||
    attrs["chunk-id"] ||
    attrs.id ||
    "";
  const rawTitle = (attrs.title || attrs.document_title || "").trim();
  const kbId = attrs.kb_id || attrs.kbid || attrs["kb-id"] || "";

  // Handle case where doc contains a markdown link [text](url)
  // This can happen when the backend nests a markdown link inside the doc attribute
  const markdownLinkMatch = rawDoc.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdownLinkMatch) {
    const linkText = markdownLinkMatch[1] ?? "";
    const linkUrl = markdownLinkMatch[2] ?? "";
    rawDoc = linkText;
    const chunkFromUrl = parseWeKnoraKbHref(linkUrl);
    if (chunkFromUrl && !rawChunk.trim()) {
      return {
        chunkId: chunkFromUrl.chunkId,
        displayTitle: linkText.trim() || chunkFromUrl.doc || rawTitle || "知识库引用",
        ...(chunkFromUrl.kbId ? { kbId: chunkFromUrl.kbId } : {}),
      };
    }
    // `weknora-kb-doc:…` is a knowledge-file reference, not a chunk id — handled in `replaceKbMatch`.
    if (parseWeKnoraKbDocHref(linkUrl) && !rawChunk.trim()) {
      return null;
    }
  }

  let chunkId = rawChunk.trim();
  if (!chunkId && rawDoc && isUuidLike(rawDoc)) {
    chunkId = rawDoc;
  }

  if (!chunkId) {
    return null;
  }

  let displayTitle = rawTitle;
  if (!displayTitle && rawDoc) {
    if (!isUuidLike(rawDoc)) {
      displayTitle = rawDoc;
    } else if (rawDoc !== chunkId) {
      displayTitle = rawDoc;
    }
  }
  if (!displayTitle) {
    displayTitle = "知识库引用";
  }

  return {
    chunkId,
    displayTitle,
    ...(kbId.trim() ? { kbId: kbId.trim() } : {}),
  };
}

function buildKbMarkdownLink(attrs: Record<string, string>): string {
  const resolved = resolveKbChunkAndTitle(attrs);
  if (!resolved) {
    return "";
  }

  const { chunkId, displayTitle, kbId } = resolved;

  const labelSource =
    displayTitle !== "知识库引用" ? displayTitle : chunkId;
  const label = escapeMarkdownLinkLabel(truncateMiddle(labelSource));

  const payload: WeKnoraKbLinkPayload = {
    doc: displayTitle,
    chunkId,
    ...(kbId ? { kbId } : {}),
  };

  try {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `[${label}](${WKNORA_KB_HREF_PREFIX}${encoded})`;
  } catch {
    return "";
  }
}

/** Doc-level pill: full `docTitle` in payload, truncated label in markdown. */
function buildKbDocMarkdownLinkDirect(
  knowledgeId: string,
  docTitleFull: string,
  labelSource?: string,
): string {
  const full = docTitleFull.trim() || knowledgeId.trim();
  const label = escapeMarkdownLinkLabel(truncateMiddle((labelSource ?? full).trim() || full));
  const payload: WeKnoraKbDocPayload = {
    knowledgeId: knowledgeId.trim(),
    docTitle: full,
  };
  try {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `[${label}](${WKNORA_KB_DOC_HREF_PREFIX}${encoded})`;
  } catch {
    return "";
  }
}

function replaceKbMatch(attrString: string, onMissing: string): string {
  const attrs = parseTagAttributes(String(attrString || ""));
  const rawDocFull = (attrs.doc || "").trim();
  const mdInDoc = rawDocFull.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
  const rawChunk =
    attrs.chunk_id ||
    attrs.chunkid ||
    attrs["chunk-id"] ||
    attrs.id ||
    "";
  const hasChunk = rawChunk.trim().length > 0;

  if (hasChunk) {
    const link = buildKbMarkdownLink(attrs);
    if (link) return link;
  }

  if (mdInDoc) {
    const linkText = (mdInDoc[1] ?? "").trim();
    const linkUrl = mdInDoc[2] ?? "";
    const docPayload = parseWeKnoraKbDocHref(linkUrl);
    if (docPayload) {
      const fullTitle = docPayload.docTitle || linkText || (attrs.title || attrs.document_title || "").trim();
      const label = linkText || fullTitle || docPayload.knowledgeId;
      return buildKbDocMarkdownLinkDirect(docPayload.knowledgeId, fullTitle || docPayload.knowledgeId, label);
    }
    const chunkPayload = parseWeKnoraKbHref(linkUrl);
    if (chunkPayload) {
      const merged: Record<string, string> = {
        ...attrs,
        doc: chunkPayload.doc,
        chunk_id: chunkPayload.chunkId,
        ...(chunkPayload.kbId ? { kb_id: chunkPayload.kbId } : {}),
      };
      const link = buildKbMarkdownLink(merged);
      if (link) return link;
    }
  }

  const knowledgeIdRaw =
    attrs.knowledge_id || attrs.knowledgeid || attrs["knowledge-id"] || "";
  if (knowledgeIdRaw.trim()) {
    const titleFromDoc = mdInDoc ? (mdInDoc[1] ?? "").trim() : rawDocFull;
    const fullTitle =
      titleFromDoc ||
      (attrs.title || attrs.document_title || "").trim() ||
      knowledgeIdRaw.trim();
    const link = buildKbDocMarkdownLinkDirect(
      knowledgeIdRaw.trim(),
      fullTitle,
      titleFromDoc || fullTitle,
    );
    if (link) return link;
  }

  const link = buildKbMarkdownLink(attrs);
  return link || onMissing;
}

/**
 * Turn assistant `<kb doc="…" chunk_id="…" />` tags into markdown links consumed by `KbCitationLink`.
 * Matches KnowHow `AgentStreamDisplay.vue` `preprocessMarkdown` behaviour, plus common variants:
 * - HTML-escaped: `&lt;kb doc=&quot;…&quot; chunk_id=&quot;…&quot; /&gt;`
 * - Empty paired tag: `<kb …></kb>`
 * - Markdown link in doc: `<kb doc="[text](weknora-kb-doc:%7B…%7D)" knowledge_id="…" />`
 */
export function preprocessKbCitationTags(markdown: string): string {
  if (!markdown) {
    return markdown;
  }

  let s = markdown;

  if (s.includes("&lt;") && /&lt;\s*kb\b/i.test(s)) {
    s = s.replace(/&lt;\s*kb\b([\s\S]*?)\s*\/\s*&gt;/gi, (full, inner: string) => {
      const decoded = decodeBasicEntities(`<kb${inner}/>`);
      const m = /<kb\b([^>]*)\/>/i.exec(decoded);
      if (!m) return full;
      return replaceKbMatch(m[1] ?? "", full);
    });
  }

  if (!s.includes("<kb")) {
    return s;
  }

  s = s.replace(/<kb\b([^>]*doc="\[[^\]]*\]\([^"]*\)"[^>]*)\/>/gi, (full, attrString: string) =>
    replaceKbMatch(attrString, full),
  );

  s = s.replace(/<kb\b([^>]*)\s*>\s*<\/kb>/gi, (full, attrString: string) =>
    replaceKbMatch(attrString, full),
  );

  s = s.replace(/<kb\b([^>]*)\/>/gi, (full, attrString: string) =>
    replaceKbMatch(attrString, full),
  );

  return s;
}
