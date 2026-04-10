import { useEffect } from "react";

import { KbCitationLink, KbDocCitationLink } from "@/components/workspace/citations/kb-citation-link";

/**
 * Dev-only fixture for Playwright: mocks chunk APIs so citations work without backend.
 * Route: `/__e2e/kb-citation-hover`
 */
export function KbCitationHoverE2ePage() {
  useEffect(() => {
    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/v1/chunks/by-id/")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { content: "E2E_CHUNK_SNIPPET_BODY" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/chunks/") && url.includes("page=") && !url.includes("/by-id/")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: "e2e-doc-resolved-chunk" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return orig(input, init);
    };
    return () => {
      window.fetch = orig;
    };
  }, []);

  return (
    <div className="bg-background min-h-screen p-8 text-foreground">
      <h1 className="mb-6 text-lg font-semibold">KB citation hover E2E</h1>
      <section className="flex flex-col gap-8">
        <div>
          <p className="text-muted-foreground mb-2 text-sm">Chunk citation (KbCitationLink)</p>
          <KbCitationLink chunkId="e2e-chunk-1" docTitle="E2E chunk doc" />
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-sm">Doc citation (KbDocCitationLink)</p>
          <KbDocCitationLink knowledgeId="e2e-knowledge-1" docTitle="E2E knowledge file">
            E2E doc pill
          </KbDocCitationLink>
        </div>
      </section>
    </div>
  );
}
