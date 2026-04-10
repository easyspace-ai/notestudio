import type { AnchorHTMLAttributes } from "react";

import { KbCitationLink, KbDocCitationLink } from "@/components/workspace/citations/kb-citation-link";
import { cn } from "@/lib/utils";

import { parseWeKnoraKbDocHref, parseWeKnoraKbHref } from "./preprocess-kb-tags";

function isExternalUrl(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

/** Shared `<a>` renderer: `weknora-kb:` → {@link KbCitationLink}, else default link styles. */
export function WeKnoraMarkdownAnchor(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { className, href, children, target, rel, ...rest } = props;
  const parsedDoc = href ? parseWeKnoraKbDocHref(href) : null;
  if (parsedDoc) {
    return (
      <KbDocCitationLink knowledgeId={parsedDoc.knowledgeId} docTitle={parsedDoc.docTitle} className={className}>
        {children}
      </KbDocCitationLink>
    );
  }
  const parsed = href ? parseWeKnoraKbHref(href) : null;
  if (parsed) {
    return (
      <KbCitationLink chunkId={parsed.chunkId} docTitle={parsed.doc} className={className}>
        {children}
      </KbCitationLink>
    );
  }
  const external = isExternalUrl(href);
  return (
    <a
      {...rest}
      href={href}
      className={cn(
        "text-primary decoration-primary/30 hover:decoration-primary/60 underline underline-offset-2 transition-colors",
        className,
      )}
      target={target ?? (external ? "_blank" : undefined)}
      rel={rel ?? (external ? "noopener noreferrer" : undefined)}
    >
      {children}
    </a>
  );
}
