import { memo } from "react";
import type { ComponentProps } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

import { assistantStreamdownPlugins } from "./plugins";

export type WeKnoraAssistantMarkdownProps = Omit<
  ComponentProps<typeof MessageResponse>,
  "remarkPlugins" | "rehypePlugins" | "children"
> & {
  children: string;
  /** Partial markdown while SSE is in flight (Streamdown incomplete parser). */
  streaming?: boolean;
};

/**
 * Project / WeKnora chat markdown: same stack as workspace (MessageResponse + Streamdown),
 * with deer-flow-style rich blocks — Shiki code headers, tables, Mermaid where applicable.
 */
export const WeKnoraAssistantMarkdown = memo(function WeKnoraAssistantMarkdown({
  className,
  streaming = false,
  children,
  ...rest
}: WeKnoraAssistantMarkdownProps) {
  return (
    <MessageResponse
      className={cn(
        "weknora-assistant-md size-full text-[15px] leading-relaxed text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_.sd-code-block]:my-3 [&_.sd-code-block_pre]:max-h-[360px] [&_.sd-code-block_pre]:overflow-auto",
        "[&_.sd-code-block]:rounded-xl [&_.sd-code-block]:border [&_.sd-code-block]:border-border/80",
        "[&_.sd-mermaid]:my-3 [&_.sd-mermaid]:rounded-xl [&_.sd-mermaid]:border [&_.sd-mermaid]:border-border/70 [&_.sd-mermaid]:bg-muted/30 [&_.sd-mermaid]:p-3",
        "[&_table]:my-3 [&_table]:min-w-full [&_table]:overflow-hidden [&_table]:rounded-lg [&_table]:border [&_table]:border-border/70",
        "[&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:px-3 [&_td]:py-2",
        className,
      )}
      remarkPlugins={assistantStreamdownPlugins.remarkPlugins}
      rehypePlugins={assistantStreamdownPlugins.rehypePlugins}
      parseIncompleteMarkdown={streaming}
      controls={{ code: true, table: true, mermaid: true }}
      shikiTheme={["github-light", "github-dark"]}
      {...rest}
    >
      {children}
    </MessageResponse>
  );
});

WeKnoraAssistantMarkdown.displayName = "WeKnoraAssistantMarkdown";
