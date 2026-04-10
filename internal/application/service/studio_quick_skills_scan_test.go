package service

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

func TestDiscoverStudioQuickItems(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "demo-skill")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	content := `---
name: demo-skill
description: Build an interactive HTML page with Reveal.js for teaching.
---
# Body
`
	path := filepath.Join(sub, "SKILL.md")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	items, err := discoverStudioQuickItems(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d items: %+v", len(items), items)
	}
	if items[0].ID != "demo-skill" || items[0].StudioKind != types.StudioKindHTML {
		t.Fatalf("unexpected item: %+v", items[0])
	}
	if items[0].SkillPath != "demo-skill" {
		t.Fatalf("skillPath: %q", items[0].SkillPath)
	}
	if items[0].Icon != "file-code" {
		t.Fatalf("icon: %q", items[0].Icon)
	}
}

func TestDiscoverStudioQuickItemsExplicitWeknoraOverridesInfer(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "override-skill")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	content := `---
name: override-skill
description: mentions podcast but forced to html via weknora_studio
weknora_studio:
  kind: html
  label: "自定义"
  default_title: "T"
  icon: file-code
---
x
`
	if err := os.WriteFile(filepath.Join(sub, "SKILL.md"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	items, err := discoverStudioQuickItems(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].StudioKind != types.StudioKindHTML || items[0].Label != "自定义" {
		t.Fatalf("%+v", items)
	}
}

func TestDiscoverStudioQuickItemsSkipsWithoutBlock(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "plain")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	content := `---
name: plain
description: no studio block
---
x
`
	if err := os.WriteFile(filepath.Join(sub, "SKILL.md"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	items, err := discoverStudioQuickItems(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("expected empty, got %+v", items)
	}
}
