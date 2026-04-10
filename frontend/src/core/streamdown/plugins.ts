import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { defaultUrlTransform, type UrlTransform } from "react-markdown";
import type { StreamdownProps } from "streamdown";

import { rehypeSplitWordsIntoSpans } from "../rehype";

import { WKNORA_KB_DOC_HREF_PREFIX, WKNORA_KB_HREF_PREFIX } from "./preprocess-kb-tags";

/**
 * `react-markdown` strips any URL whose protocol is not https/mailto/irc/xmpp.
 * Our synthetic citation targets must survive to reach {@link WeKnoraMarkdownAnchor}.
 */
export const weKnoraAwareUrlTransform: UrlTransform = (url) => {
  const u = String(url || "");
  if (u.startsWith(WKNORA_KB_HREF_PREFIX) || u.startsWith(WKNORA_KB_DOC_HREF_PREFIX)) {
    return u;
  }
  return defaultUrlTransform(url);
};

export function mergeWithWeKnoraUrlTransform(user?: UrlTransform | null): UrlTransform {
  if (!user) return weKnoraAwareUrlTransform;
  return (url, key, node) => {
    const u = String(url || "");
    if (u.startsWith(WKNORA_KB_HREF_PREFIX) || u.startsWith(WKNORA_KB_DOC_HREF_PREFIX)) {
      return u;
    }
    const v = user(url, key, node);
    if (v !== null && v !== undefined) return v;
    return defaultUrlTransform(url);
  };
}

export const streamdownPlugins = {
  remarkPlugins: [
    remarkGfm,
    [remarkMath, { singleDollarTextMath: true }],
  ] as StreamdownProps["remarkPlugins"],
  rehypePlugins: [
    rehypeRaw,
    [rehypeKatex, { output: "html" }],
  ] as StreamdownProps["rehypePlugins"],
  urlTransform: weKnoraAwareUrlTransform,
};

// Assistant chat content must not render raw HTML inline, otherwise generated
// <style>/<html>/<body> blocks can escape the bubble and pollute the whole app.
export const assistantStreamdownPlugins = {
  remarkPlugins: [
    remarkGfm,
    [remarkMath, { singleDollarTextMath: true }],
  ] as StreamdownProps["remarkPlugins"],
  rehypePlugins: [[rehypeKatex, { output: "html" }]] as StreamdownProps["rehypePlugins"],
  urlTransform: weKnoraAwareUrlTransform,
};

export const streamdownPluginsWithWordAnimation = {
  remarkPlugins: [
    remarkGfm,
    [remarkMath, { singleDollarTextMath: true }],
  ] as StreamdownProps["remarkPlugins"],
  rehypePlugins: [
    [rehypeKatex, { output: "html" }],
    rehypeSplitWordsIntoSpans,
  ] as StreamdownProps["rehypePlugins"],
  urlTransform: weKnoraAwareUrlTransform,
};

// Plugins for human messages - no autolink to prevent URL bleeding into adjacent text
export const humanMessagePlugins = {
  remarkPlugins: [
    // Use remark-gfm without autolink literals by not including it
    // Only include math support for human messages
    [remarkMath, { singleDollarTextMath: true }],
  ] as StreamdownProps["remarkPlugins"],
  rehypePlugins: [
    [rehypeKatex, { output: "html" }],
  ] as StreamdownProps["rehypePlugins"],
};
