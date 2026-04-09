package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPathWithinRoot(t *testing.T) {
	root := "/data/base"
	if !PathWithinRoot(root, "/data/base") {
		t.Fatal("equal path should match")
	}
	if !PathWithinRoot(root, "/data/base/sub") {
		t.Fatal("child should match")
	}
	if PathWithinRoot(root, "/data/baseother") {
		t.Fatal("prefix trap should not match")
	}
	if PathWithinRoot(root, "/data") {
		t.Fatal("parent should not match")
	}
}

func TestResolveVirtualPath_userData(t *testing.T) {
	root := t.TempDir()
	const tid uint64 = 7
	sid := "sess-1"
	_ = EnsureWorkspaceDirs(root, tid, sid)

	got := ResolveVirtualPath(root, tid, sid, nil, "/mnt/user-data/out.txt")
	want := filepath.Join(UserDataDir(root, tid, sid), "out.txt")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveVirtualPath_relative(t *testing.T) {
	root := t.TempDir()
	const tid uint64 = 1
	sid := "s2"
	_ = EnsureWorkspaceDirs(root, tid, sid)

	got := ResolveVirtualPath(root, tid, sid, nil, "foo/bar.txt")
	want := filepath.Join(WorkspaceDir(root, tid, sid), "foo", "bar.txt")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestValidateWritable_skillsDenied(t *testing.T) {
	err := ValidateWritable("/mnt/skills/x/SKILL.md", "/tmp/foo", nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateWritable_acpDenied(t *testing.T) {
	err := ValidateWritable("/mnt/acp-workspace/out", "/tmp/out", nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestMaskLocalPaths(t *testing.T) {
	root := t.TempDir()
	const tid uint64 = 3
	sid := "s9"
	_ = EnsureWorkspaceDirs(root, tid, sid)
	ud := UserDataDir(root, tid, sid)

	text := "see " + ud + "/f.txt"
	masked := MaskLocalPaths(root, tid, sid, nil, text)
	if masked == text {
		t.Fatalf("expected mask, got %q", masked)
	}
	if !strings.Contains(masked, VirtualUserData) {
		t.Fatalf("expected virtual prefix in %q", masked)
	}
}

func TestResolveSkillsPath_escape(t *testing.T) {
	dir := t.TempDir()
	_, ok := ResolveSkillsPath([]string{dir}, "/mnt/skills/../etc/passwd")
	if ok {
		t.Fatal("expected no match for escape")
	}
}

func TestResolveSkillsPath_file(t *testing.T) {
	dir := t.TempDir()
	skillHome := filepath.Join(dir, "my-skill")
	if err := os.MkdirAll(skillHome, 0o755); err != nil {
		t.Fatal(err)
	}
	f := filepath.Join(skillHome, "a.txt")
	if err := os.WriteFile(f, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, ok := ResolveSkillsPath([]string{dir}, "/mnt/skills/my-skill/a.txt")
	if !ok || got != f {
		t.Fatalf("got %q ok=%v", got, ok)
	}
}
