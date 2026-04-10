"use client";

import { useMemo } from "react";
import type { AnchorHTMLAttributes } from "react";

import {
  MessageResponse,
  type MessageResponseProps,
} from "@/components/ai-elements/message";
import {
  assistantStreamdownPlugins,
  preprocessKbCitationTags,
  WeKnoraMarkdownAnchor,
} from "@/core/streamdown";

import { CitationLink } from "../citations/citation-link";

export type MarkdownContentProps = {
  content: string;
  isLoading: boolean;
  rehypePlugins: MessageResponseProps["rehypePlugins"];
  className?: string;
  remarkPlugins?: MessageResponseProps["remarkPlugins"];
  components?: MessageResponseProps["components"];
};

/** Renders markdown content. */
export function MarkdownContent({
  content,
  rehypePlugins,
  className,
  remarkPlugins = assistantStreamdownPlugins.remarkPlugins,
  components: componentsFromProps,
}: MarkdownContentProps) {
  const processedContent = useMemo(() => preprocessKbCitationTags(content), [content]);

  const components = useMemo(() => {
    return {
      ...componentsFromProps,
      a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (typeof props.children === "string") {
          const match = /^citation:(.+)$/.exec(props.children);
          if (match) {
            const [, text] = match;
            return <CitationLink {...props}>{text}</CitationLink>;
          }
        }
        return <WeKnoraMarkdownAnchor {...props} />;
      },
    };
  }, [componentsFromProps]);

  if (!processedContent) return null;

  return (
    <MessageResponse
      className={className}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {processedContent}
    </MessageResponse>
  );
}
