package service

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"gopkg.in/yaml.v3"
)

// weknoraStudioBlock is optional YAML under SKILL.md frontmatter. When set, it overrides
// auto-inferred studio kind / labels. Without it, we infer kind from name + description.
type weknoraStudioBlock struct {
	Kind         string `yaml:"kind"`
	SkillPath    string `yaml:"skill_path"`
	Label        string `yaml:"label"`
	DefaultTitle string `yaml:"default_title"`
	Icon         string `yaml:"icon"`
	Description  string `yaml:"description"`
}

type skillFileWeknoraYAML struct {
	Name          string              `yaml:"name"`
	Description   string              `yaml:"description"`
	WeknoraStudio *weknoraStudioBlock `yaml:"weknora_studio"`
}

func validStudioQuickKind(k string) bool {
	switch k {
	case types.StudioKindHTML, types.StudioKindSlides, types.StudioKindAudio, types.StudioKindMindmap:
		return true
	default:
		return false
	}
}

// Well-known skill names → studio kind (takes precedence over keyword heuristics).
var studioKindBySkillName = map[string]string{
	"ppt-master":         types.StudioKindSlides,
	"webpage-generator":  types.StudioKindHTML,
	"podcast-generation": types.StudioKindAudio,
	// 以下技能无明确「课件/播客」语义，映射为 html 以便进入 Studio 快贴；用户仍走同一套 Studio 任务（可再在 SKILL/weknora_studio 细化）。
	"deep-research":    types.StudioKindHTML,
	"image-generation": types.StudioKindHTML,
}

// Optional Chinese / product copy when there is no weknora_studio block.
var studioQuickDisplayByName = map[string]struct {
	Label, DefaultTitle string
}{
	"ppt-master":         {Label: "生成 PPT 演示文稿", DefaultTitle: "PPT演示文稿"},
	"webpage-generator":  {Label: "生成教学网页", DefaultTitle: "教学网页"},
	"podcast-generation": {Label: "生成播客音频", DefaultTitle: "播客"},
	"deep-research":      {Label: "深度检索 / 调研", DefaultTitle: "调研网页"},
	"image-generation":   {Label: "图像生成", DefaultTitle: "视觉内容"},
}

func inferStudioKindFromSkill(name, description string) (kind string, ok bool) {
	n := strings.ToLower(strings.TrimSpace(name))
	d := strings.ToLower(strings.TrimSpace(description))
	c := n + " " + d

	if k, hit := studioKindBySkillName[n]; hit {
		return k, true
	}

	for _, kw := range []string{"pptx", "powerpoint", "slide deck", "export to pptx", "svg pages", "演示文稿", "生成ppt", "做ppt", "制作ppt"} {
		if strings.Contains(c, kw) {
			return types.StudioKindSlides, true
		}
	}
	for _, kw := range []string{"webpage-generator", "interactive html", "reveal.js", "revealjs", "教学网页", "html演示", "html 演示"} {
		if strings.Contains(c, kw) {
			return types.StudioKindHTML, true
		}
	}
	if strings.Contains(n, "webpage") && strings.Contains(n, "generator") {
		return types.StudioKindHTML, true
	}

	for _, kw := range []string{"podcast", "two-host", "text-to-speech", "text to speech", "播客", "音频节目"} {
		if strings.Contains(c, kw) {
			return types.StudioKindAudio, true
		}
	}

	for _, kw := range []string{"mind map", "mindmap", "思维导图"} {
		if strings.Contains(c, kw) {
			return types.StudioKindMindmap, true
		}
	}
	return "", false
}

func truncateRunes(s string, max int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return strings.TrimSpace(s)
	}
	return string(r[:max]) + "…"
}

func autoStudioLabels(name, description string) (label, defaultTitle, longDesc string) {
	longDesc = strings.TrimSpace(description)
	defaultTitle = strings.TrimSpace(strings.ReplaceAll(strings.TrimSpace(name), "-", " "))
	if defaultTitle == "" {
		defaultTitle = strings.TrimSpace(name)
	}
	if longDesc != "" {
		label = truncateRunes(longDesc, 48)
	} else {
		label = defaultTitle
	}
	return label, defaultTitle, longDesc
}

func iconForStudioKind(kind string) string {
	switch kind {
	case types.StudioKindSlides:
		return "presentation"
	case types.StudioKindHTML:
		return "file-code"
	case types.StudioKindAudio:
		return "mic"
	case types.StudioKindMindmap:
		return "brain"
	default:
		return "sparkles"
	}
}

func makeStudioQuickSkillItem(head *skillFileWeknoraYAML, relDir string, logf func(string, ...any)) (types.StudioQuickSkillItem, bool) {
	var zero types.StudioQuickSkillItem
	name := strings.TrimSpace(head.Name)
	if name == "" {
		return zero, false
	}
	desc := strings.TrimSpace(head.Description)
	relDir = filepath.ToSlash(relDir)

	var kind string
	explicit := head.WeknoraStudio
	if explicit != nil && strings.TrimSpace(explicit.Kind) != "" {
		kind = strings.TrimSpace(explicit.Kind)
		if !validStudioQuickKind(kind) {
			if logf != nil {
				logf("studio quick scan: invalid weknora_studio.kind %q for skill %q", kind, name)
			}
			return zero, false
		}
	} else {
		var ok bool
		kind, ok = inferStudioKindFromSkill(name, desc)
		if !ok {
			return zero, false
		}
	}

	skillPath := relDir
	if explicit != nil {
		if sp := strings.TrimSpace(explicit.SkillPath); sp != "" {
			skillPath = strings.Trim(filepath.ToSlash(sp), "/")
		}
	}

	label, defTitle, longDesc := autoStudioLabels(name, desc)
	icon := iconForStudioKind(kind)
	if explicit == nil {
		if ov, ok := studioQuickDisplayByName[name]; ok {
			label = ov.Label
			defTitle = ov.DefaultTitle
		}
	}
	if explicit != nil {
		if s := strings.TrimSpace(explicit.Label); s != "" {
			label = s
		}
		if s := strings.TrimSpace(explicit.DefaultTitle); s != "" {
			defTitle = s
		}
		if s := strings.TrimSpace(explicit.Description); s != "" {
			longDesc = s
		}
		if s := strings.TrimSpace(explicit.Icon); s != "" {
			icon = s
		}
	}

	return types.StudioQuickSkillItem{
		ID:           name,
		SkillPath:    skillPath,
		StudioKind:   kind,
		DefaultTitle: defTitle,
		Label:        label,
		Description:  longDesc,
		Icon:         icon,
	}, true
}

func splitSkillFrontmatter(content string) (string, error) {
	s := strings.TrimSpace(content)
	if !strings.HasPrefix(s, "---") {
		return "", errors.New("SKILL.md must start with YAML frontmatter (---)")
	}
	scanner := bufio.NewScanner(strings.NewReader(s))
	var lines []string
	inFrontmatter := false
	frontmatterEnded := false
	first := true
	for scanner.Scan() {
		line := scanner.Text()
		if first {
			first = false
			if strings.TrimSpace(line) != "---" {
				return "", errors.New("invalid frontmatter start")
			}
			inFrontmatter = true
			continue
		}
		if inFrontmatter && strings.TrimSpace(line) == "---" {
			inFrontmatter = false
			frontmatterEnded = true
			break
		}
		if inFrontmatter {
			lines = append(lines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	if !frontmatterEnded {
		return "", errors.New("SKILL.md frontmatter is not closed with ---")
	}
	return strings.Join(lines, "\n"), nil
}

func parseSkillFileForWeknoraStudio(content string) (*skillFileWeknoraYAML, error) {
	fm, err := splitSkillFrontmatter(content)
	if err != nil {
		return nil, err
	}
	var head skillFileWeknoraYAML
	if err := yaml.Unmarshal([]byte(fm), &head); err != nil {
		return nil, err
	}
	return &head, nil
}

func discoverStudioQuickItems(pubRoot string, logf func(string, ...any)) ([]types.StudioQuickSkillItem, error) {
	disabled, err := readDisabledSkillNames()
	if err != nil {
		return nil, err
	}

	byName := make(map[string]types.StudioQuickSkillItem)

	err = filepath.WalkDir(pubRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if d.Name() != skills.SkillFileName {
			return nil
		}

		raw, err := os.ReadFile(path)
		if err != nil {
			if logf != nil {
				logf("studio quick scan: read %s: %v", path, err)
			}
			return nil
		}
		head, err := parseSkillFileForWeknoraStudio(string(raw))
		if err != nil {
			if logf != nil {
				logf("studio quick scan: skip %s: %v", path, err)
			}
			return nil
		}
		name := strings.TrimSpace(head.Name)
		if name == "" {
			if logf != nil {
				logf("studio quick scan: missing name in %s", path)
			}
			return nil
		}
		if _, off := disabled[name]; off {
			return nil
		}

		skillDir := filepath.Dir(path)
		relDir, err := filepath.Rel(pubRoot, skillDir)
		if err != nil {
			return err
		}
		relDir = filepath.ToSlash(relDir)

		item, ok := makeStudioQuickSkillItem(head, relDir, logf)
		if !ok {
			return nil
		}

		if _, dup := byName[name]; dup && logf != nil {
			logf("studio quick scan: duplicate skill name %q, later file wins (%s)", name, path)
		}
		byName[name] = item
		return nil
	})
	if err != nil {
		return nil, err
	}

	collected := make([]types.StudioQuickSkillItem, 0, len(byName))
	for _, it := range byName {
		collected = append(collected, it)
	}
	sort.Slice(collected, func(i, j int) bool {
		return collected[i].Label < collected[j].Label
	})
	return collected, nil
}

func writeStudioQuickSkillsJSON(pubRoot string, m *types.StudioQuickSkillsManifest) error {
	out := filepath.Join(pubRoot, "studio-quick-skills.json")
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal studio quick skills: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(out, data, 0644); err != nil {
		return fmt.Errorf("write %s: %w", out, err)
	}
	return nil
}

// scanAndPersistStudioQuickSkills walks skills/pubic for SKILL.md, infers Studio quick rows from name/description
// (or weknora_studio overrides), writes studio-quick-skills.json, and returns the manifest.
func scanAndPersistStudioQuickSkills(ctx context.Context, pubRoot string) (*types.StudioQuickSkillsManifest, error) {
	logf := func(format string, args ...any) {
		logger.Warnf(ctx, format, args...)
	}
	items, err := discoverStudioQuickItems(pubRoot, logf)
	if err != nil {
		return nil, err
	}
	items, err = ApplySkillStudioUIOverridesToItems(items)
	if err != nil {
		return nil, err
	}
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: items}
	if err := writeStudioQuickSkillsJSON(pubRoot, m); err != nil {
		// 镜像/只读挂载下 skills/pubic 可能不可写；仍返回内存 manifest，避免管理端保存覆盖后清单被清空。
		logger.Warnf(ctx, "studio quick skills: skip writing studio-quick-skills.json under %s: %v", pubRoot, err)
		return m, nil
	}
	logger.Infof(ctx, "studio quick skills: wrote %s (%d items)", filepath.Join(pubRoot, "studio-quick-skills.json"), len(items))
	return m, nil
}
