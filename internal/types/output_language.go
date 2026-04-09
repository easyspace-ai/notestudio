package types

import (
	"context"
	"strings"
	"unicode"
)

// outputLanguageDirectiveMarker prevents appending the same block twice when multiple layers build prompts.
const outputLanguageDirectiveMarker = "<!-- weknora_output_language_directive -->"

// ContainsCJK reports whether s contains any CJK unified ideograph (common in zh/ja/ko text).
func ContainsCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// EffectiveOutputLanguageName returns the human-readable language name for model output.
// If the HTTP locale is English but the user's message contains Chinese characters, we still
// force Chinese (Simplified) so answers match the question (fixes wrong Accept-Language /
// WEKNORA_LANGUAGE=en* deployments).
func EffectiveOutputLanguageName(ctx context.Context, userQuery string) string {
	name := LanguageNameFromContext(ctx)
	lang, ok := LanguageFromContext(ctx)
	if !ContainsCJK(userQuery) {
		return name
	}
	// User wrote Chinese
	switch name {
	case "Chinese (Simplified)", "Chinese (Traditional)":
		return name
	}
	if !ok {
		return "Chinese (Simplified)"
	}
	if strings.HasPrefix(lang, "en") {
		return "Chinese (Simplified)"
	}
	// e.g. ja-JP with accidental Han — keep mapped name from locale
	return name
}

// AppendOutputLanguageDirective appends a short, high-salience block so the model follows output language.
func AppendOutputLanguageDirective(systemPrompt, languageDisplayName string) string {
	if strings.Contains(systemPrompt, outputLanguageDirectiveMarker) {
		return systemPrompt
	}
	var b strings.Builder
	b.WriteString(systemPrompt)
	b.WriteString("\n\n")
	b.WriteString(outputLanguageDirectiveMarker)
	b.WriteString("\n### OUTPUT LANGUAGE (MANDATORY)\n")
	b.WriteString("- Write the **entire** reply, including any visible thinking or <redacted_thinking> sections, in **")
	b.WriteString(languageDisplayName)
	b.WriteString("**.\n")
	b.WriteString("- Do not use another natural language unless the user explicitly asks for it.\n")
	return b.String()
}
