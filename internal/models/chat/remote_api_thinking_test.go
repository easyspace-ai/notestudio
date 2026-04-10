package chat

import "testing"

func TestRemoveThinkingContent_HTMLInsideThinkBlock(t *testing.T) {
	t.Parallel()
	// Must match thinkStartTag / thinkEndTag in remote_api.go (`<redacted_thinking>` … `</think>`).
	const open = "<think>"
	const close = "</think>"
	raw := open + "\n<!DOCTYPE html><html><body>x</body></html>\n" + close
	got := removeThinkingContent(raw)
	want := "<!DOCTYPE html><html><body>x</body></html>"
	if got != want {
		t.Fatalf("removeThinkingContent: got %q want %q", got, want)
	}
}

func TestMessageLooksLikeHTMLDocument(t *testing.T) {
	t.Parallel()
	if !messageLooksLikeHTMLDocument("<!DOCTYPE html><html></html>") {
		t.Fatal("expected true for doctype")
	}
	if !messageLooksLikeHTMLDocument("<html></html>") {
		t.Fatal("expected true for html root")
	}
	if messageLooksLikeHTMLDocument("plain text") {
		t.Fatal("expected false for prose")
	}
}
