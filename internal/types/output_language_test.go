package types

import (
	"context"
	"testing"
)

func TestContainsCJK(t *testing.T) {
	if !ContainsCJK("请概括") {
		t.Fatal("expected CJK")
	}
	if ContainsCJK("hello") {
		t.Fatal("expected no CJK")
	}
}

func TestEffectiveOutputLanguageName_enLocaleChineseQuery(t *testing.T) {
	ctx := context.WithValue(context.Background(), LanguageContextKey, "en-US")
	got := EffectiveOutputLanguageName(ctx, "请概括 Readme")
	if got != "Chinese (Simplified)" {
		t.Fatalf("got %q want Chinese (Simplified)", got)
	}
}

func TestEffectiveOutputLanguageName_zhLocale(t *testing.T) {
	ctx := context.WithValue(context.Background(), LanguageContextKey, "zh-CN")
	got := EffectiveOutputLanguageName(ctx, "请概括")
	if got != "Chinese (Simplified)" {
		t.Fatalf("got %q", got)
	}
}

func TestEffectiveOutputLanguageName_enQuery(t *testing.T) {
	ctx := context.WithValue(context.Background(), LanguageContextKey, "en-US")
	got := EffectiveOutputLanguageName(ctx, "summarize readme")
	if got != "English" {
		t.Fatalf("got %q want English", got)
	}
}

func TestAppendOutputLanguageDirective_idempotent(t *testing.T) {
	s := "base"
	s2 := AppendOutputLanguageDirective(s, "Chinese (Simplified)")
	if s2 == s {
		t.Fatal("expected append")
	}
	s3 := AppendOutputLanguageDirective(s2, "Chinese (Simplified)")
	if s3 != s2 {
		t.Fatal("expected idempotent")
	}
}
