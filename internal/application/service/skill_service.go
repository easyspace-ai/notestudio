package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// DefaultPreloadedSkillsDir is the default directory for preloaded skills.
const DefaultPreloadedSkillsDir = "skills/preloaded"

// DefaultPublicSkillsDir is the directory for operator-managed public skills (alongside preloaded).
const DefaultPublicSkillsDir = "skills/pubic"

// DefaultXiuMeiSkillsDir is the directory for "秀梅" namespace public skills.
const DefaultXiuMeiSkillsDir = "skills/秀梅"

// DefaultSkillParentDirs are relative paths passed to the agent runtime (cwd = process working directory).
func DefaultSkillParentDirs() []string {
	return []string{DefaultPreloadedSkillsDir, DefaultPublicSkillsDir, DefaultXiuMeiSkillsDir}
}

// skillService implements SkillService interface
type skillService struct {
	loader              *skills.Loader
	preloadedDir        string
	studioQuickManifest *types.StudioQuickSkillsManifest
	mu                  sync.Mutex
	initialized         bool
}

// NewSkillService creates a new skill service
func NewSkillService() interfaces.SkillService {
	preloadedDir := getPreloadedSkillsDir()
	return &skillService{
		preloadedDir: preloadedDir,
		initialized:  false,
	}
}

// getPreloadedSkillsDir returns the path to the preloaded skills directory
func getPreloadedSkillsDir() string {
	if dir := os.Getenv("WEKNORA_SKILLS_DIR"); dir != "" {
		return dir
	}

	execPath, err := os.Executable()
	if err == nil {
		execDir := filepath.Dir(execPath)
		skillsDir := filepath.Join(execDir, DefaultPreloadedSkillsDir)
		if _, err := os.Stat(skillsDir); err == nil {
			return skillsDir
		}
	}

	cwd, err := os.Getwd()
	if err == nil {
		skillsDir := filepath.Join(cwd, DefaultPreloadedSkillsDir)
		if _, err := os.Stat(skillsDir); err == nil {
			return skillsDir
		}
	}

	return DefaultPreloadedSkillsDir
}

func (s *skillService) skillSearchDirs() []string {
	pre := s.preloadedDir
	base := filepath.Dir(pre)
	pub := filepath.Join(base, "pubic")
	xm := filepath.Join(base, "秀梅")
	return []string{pre, pub, xm}
}

func (s *skillService) absSkillRoots() ([]string, error) {
	var out []string
	for _, d := range s.skillSearchDirs() {
		abs := d
		if !filepath.IsAbs(abs) {
			cwd, err := os.Getwd()
			if err != nil {
				return nil, err
			}
			abs = filepath.Join(cwd, d)
		}
		out = append(out, abs)
	}
	return out, nil
}

func (s *skillService) publicRootAbs() (string, error) {
	roots, err := s.absSkillRoots()
	if err != nil || len(roots) < 2 {
		return "", err
	}
	return roots[1], nil
}

func (s *skillService) skillSource(meta *skills.SkillMetadata) string {
	pub, err := s.publicRootAbs()
	if err != nil || pub == "" {
		return "preloaded"
	}
	baseAbs, err := filepath.Abs(meta.BasePath)
	if err != nil {
		return "preloaded"
	}
	pubAbs, err := filepath.Abs(pub)
	if err != nil {
		return "preloaded"
	}
	if baseAbs == pubAbs || strings.HasPrefix(baseAbs, pubAbs+string(filepath.Separator)) {
		return "pubic"
	}
	return "preloaded"
}

func (s *skillService) ensureInitialized(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.initialized {
		return nil
	}

	if _, err := os.Stat(s.preloadedDir); os.IsNotExist(err) {
		logger.Warnf(ctx, "Preloaded skills directory does not exist: %s", s.preloadedDir)
		if err := os.MkdirAll(s.preloadedDir, 0755); err != nil {
			logger.Warnf(ctx, "Failed to create preloaded skills directory: %v", err)
		}
	}

	dirs := s.skillSearchDirs()
	for _, d := range dirs {
		if _, err := os.Stat(d); os.IsNotExist(err) {
			if err := os.MkdirAll(d, 0755); err != nil {
				logger.Warnf(ctx, "Failed to create skills directory %s: %v", d, err)
			}
		}
	}

	s.loader = skills.NewLoader(dirs)
	s.loadStudioQuickSkillsLocked(ctx)
	s.initialized = true

	logger.Infof(ctx, "Skill service initialized with skill dirs: %v", dirs)
	return nil
}

func (s *skillService) loadStudioQuickSkillsLocked(ctx context.Context) {
	pub, err := s.publicRootAbs()
	if err != nil || pub == "" {
		logger.Warnf(ctx, "studio quick skills: public skills root unavailable: %v", err)
		s.studioQuickManifest = emptyStudioQuickManifest()
		return
	}
	if _, err := os.Stat(pub); err != nil {
		if os.IsNotExist(err) {
			logger.Warnf(ctx, "studio quick skills: public skills dir missing: %s", pub)
		} else {
			logger.Warnf(ctx, "studio quick skills: stat %s: %v", pub, err)
		}
		s.studioQuickManifest = emptyStudioQuickManifest()
		return
	}
	s.refreshStudioQuickUnderLock(ctx)
}

// refreshStudioQuickUnderLock rescans skills/pubic, merges skill_studio_overrides, writes JSON, updates in-memory manifest.
// Caller must hold s.mu.
func (s *skillService) refreshStudioQuickUnderLock(ctx context.Context) {
	pub, err := s.publicRootAbs()
	if err != nil || pub == "" {
		s.studioQuickManifest = emptyStudioQuickManifest()
		return
	}
	m, err := scanAndPersistStudioQuickSkills(ctx, pub)
	if err != nil {
		logger.Errorf(ctx, "studio quick skills: scan/write failed: %v", err)
		s.studioQuickManifest = emptyStudioQuickManifest()
		return
	}
	s.studioQuickManifest = m
}

func emptyStudioQuickManifest() *types.StudioQuickSkillsManifest {
	return &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{}}
}

// GetStudioQuickSkillsManifest returns the manifest produced at init by scanning skills/pubic (see weknora_studio in SKILL.md).
func (s *skillService) GetStudioQuickSkillsManifest(ctx context.Context) (*types.StudioQuickSkillsManifest, error) {
	if err := s.ensureInitialized(ctx); err != nil {
		return nil, fmt.Errorf("failed to initialize skill service: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.studioQuickManifest == nil {
		return emptyStudioQuickManifest(), nil
	}
	return s.studioQuickManifest, nil
}

// RefreshStudioQuickSkills rescans pubic skills and studio UI overrides (after admin edits SKILL or overrides JSON).
func (s *skillService) RefreshStudioQuickSkills(ctx context.Context) error {
	if err := s.ensureInitialized(ctx); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshStudioQuickUnderLock(ctx)
	return nil
}

// PutSkillStudioUI persists platform-admin Studio/魔棒展示配置 and refreshes the quick manifest.
func (s *skillService) PutSkillStudioUI(ctx context.Context, name string, entry types.SkillStudioUIEntry) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("skill name required")
	}
	byName, err := readSkillStudioOverrides()
	if err != nil {
		return err
	}
	if skillStudioUIEntryIsClear(entry) {
		delete(byName, name)
	} else {
		byName[name] = entry
	}
	if err := writeSkillStudioOverrides(byName); err != nil {
		return err
	}
	return s.RefreshStudioQuickSkills(ctx)
}

func skillStudioUIEntryIsClear(e types.SkillStudioUIEntry) bool {
	return e.DisplayLabel == "" && e.DefaultTitle == "" && e.Icon == "" && e.StudioKind == "" && e.ShowInStudioUI == nil
}

func (s *skillService) isSkillDisabled(name string) bool {
	disabled, err := readDisabledSkillNames()
	if err != nil {
		return false
	}
	_, ok := disabled[name]
	return ok
}

// ListPreloadedSkills returns metadata for enabled skills only (tenant/user API).
func (s *skillService) ListPreloadedSkills(ctx context.Context) ([]*skills.SkillMetadata, error) {
	if err := s.ensureInitialized(ctx); err != nil {
		return nil, fmt.Errorf("failed to initialize skill service: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	metadata, err := s.loader.DiscoverSkills()
	if err != nil {
		logger.Errorf(ctx, "Failed to discover preloaded skills: %v", err)
		return nil, fmt.Errorf("failed to discover skills: %w", err)
	}

	disabled, err := readDisabledSkillNames()
	if err != nil {
		logger.Warnf(ctx, "Failed to read skill overrides: %v", err)
		disabled = map[string]struct{}{}
	}

	var filtered []*skills.SkillMetadata
	for _, m := range metadata {
		if _, off := disabled[m.Name]; !off {
			filtered = append(filtered, m)
		}
	}

	logger.Infof(ctx, "Discovered %d skills (%d enabled)", len(metadata), len(filtered))
	return filtered, nil
}

// GetSkillByName retrieves a skill by its name (disabled skills are not available).
func (s *skillService) GetSkillByName(ctx context.Context, name string) (*skills.Skill, error) {
	if s.isSkillDisabled(name) {
		return nil, fmt.Errorf("skill is disabled: %s", name)
	}
	if err := s.ensureInitialized(ctx); err != nil {
		return nil, fmt.Errorf("failed to initialize skill service: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	skill, err := s.loader.LoadSkillInstructions(name)
	if err != nil {
		logger.Errorf(ctx, "Failed to load skill %s: %v", name, err)
		return nil, fmt.Errorf("failed to load skill: %w", err)
	}
	return skill, nil
}

// GetPreloadedDir returns the configured preloaded skills directory
func (s *skillService) GetPreloadedDir() string {
	return s.preloadedDir
}

// FilterToEnabledSkillNames returns only names that are not in the disabled overrides file.
func (s *skillService) FilterToEnabledSkillNames(ctx context.Context, names []string) ([]string, error) {
	_ = ctx
	disabled, err := readDisabledSkillNames()
	if err != nil {
		return nil, err
	}
	var out []string
	for _, n := range names {
		if _, off := disabled[n]; !off {
			out = append(out, n)
		}
	}
	return out, nil
}

// ListSkillsForAdmin returns all discovered skills including disabled (platform admin).
func (s *skillService) ListSkillsForAdmin(ctx context.Context) ([]types.SkillAdminRow, error) {
	if err := s.ensureInitialized(ctx); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	metadata, err := s.loader.DiscoverSkills()
	if err != nil {
		return nil, err
	}

	disabled, err := readDisabledSkillNames()
	if err != nil {
		return nil, err
	}

	ov, err := readSkillStudioOverrides()
	if err != nil {
		return nil, err
	}

	rows := make([]types.SkillAdminRow, 0, len(metadata))
	for _, m := range metadata {
		_, off := disabled[m.Name]
		row := types.SkillAdminRow{
			Name:        m.Name,
			Description: m.Description,
			Source:      s.skillSource(m),
			Enabled:     !off,
		}
		if e, ok := ov[m.Name]; ok {
			cp := e
			row.StudioUI = &cp
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// GetSkillDetailForAdmin returns full SKILL.md for editing.
func (s *skillService) GetSkillDetailForAdmin(ctx context.Context, name string) (*types.SkillAdminDetail, error) {
	if err := s.ensureInitialized(ctx); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	skill, err := s.loader.LoadSkillInstructions(name)
	if err != nil {
		return nil, err
	}

	disabled, err := readDisabledSkillNames()
	if err != nil {
		return nil, err
	}
	_, off := disabled[name]

	meta := skill.ToMetadata()
	content, err := os.ReadFile(skill.FilePath)
	if err != nil {
		return nil, err
	}

	cwd, _ := os.Getwd()
	rel := skill.FilePath
	if cwd != "" {
		if r, err := filepath.Rel(cwd, skill.FilePath); err == nil {
			rel = r
		}
	}

	row := types.SkillAdminRow{
		Name:        meta.Name,
		Description: meta.Description,
		Source:      s.skillSource(meta),
		Enabled:     !off,
	}
	if ov, err := readSkillStudioOverrides(); err == nil {
		if e, ok := ov[name]; ok {
			cp := e
			row.StudioUI = &cp
		}
	}

	return &types.SkillAdminDetail{
		SkillAdminRow: row,
		Content:       string(content),
		RelPath:       rel,
	}, nil
}

// UpdateSkillFile writes SKILL.md after validation. Admin only.
func (s *skillService) UpdateSkillFile(ctx context.Context, name string, content string) error {
	parsed, err := skills.ParseSkillFile(content)
	if err != nil {
		return fmt.Errorf("invalid SKILL.md: %w", err)
	}
	if parsed.Name != name {
		return fmt.Errorf("frontmatter name %q must match URL skill name %q", parsed.Name, name)
	}

	if err := s.ensureInitialized(ctx); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	skill, err := s.loader.LoadSkillInstructions(name)
	if err != nil {
		return err
	}

	if err := s.assertPathUnderSkillRoots(skill.FilePath); err != nil {
		return err
	}

	if err := os.WriteFile(skill.FilePath, []byte(content), 0644); err != nil {
		return err
	}

	if _, err := s.loader.Reload(); err != nil {
		logger.Warnf(ctx, "skill reload after write failed: %v", err)
	}
	s.refreshStudioQuickUnderLock(ctx)
	return nil
}

func (s *skillService) assertPathUnderSkillRoots(filePath string) error {
	roots, err := s.absSkillRoots()
	if err != nil {
		return err
	}
	absFile, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}
	for _, root := range roots {
		rootAbs, err := filepath.Abs(root)
		if err != nil {
			continue
		}
		if absFile == rootAbs || strings.HasPrefix(absFile, rootAbs+string(filepath.Separator)) {
			return nil
		}
	}
	return fmt.Errorf("skill file outside configured skill roots")
}

// SetSkillEnabled persists enable/disable for chat/agent discovery.
func (s *skillService) SetSkillEnabled(ctx context.Context, name string, enabled bool) error {
	if err := s.ensureInitialized(ctx); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.loader.LoadSkillInstructions(name); err != nil {
		return err
	}

	if err := setSkillEnabledInOverrides(name, enabled); err != nil {
		return err
	}

	if _, err := s.loader.Reload(); err != nil {
		logger.Warnf(ctx, "skill reload after enable toggle failed: %v", err)
	}
	return nil
}

// ResolveAgentSkillAllowlist returns skill dirs for the agent and an optional name allowlist when some skills are disabled.
func (s *skillService) ResolveAgentSkillAllowlist(ctx context.Context) (skillDirs []string, allowed []string, disableAll bool, err error) {
	skillDirs = DefaultSkillParentDirs()
	if err := s.ensureInitialized(ctx); err != nil {
		return nil, nil, false, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	allMeta, err := s.loader.DiscoverSkills()
	if err != nil {
		return nil, nil, false, err
	}

	disabled, err := readDisabledSkillNames()
	if err != nil {
		return nil, nil, false, err
	}

	var enabledNames []string
	for _, m := range allMeta {
		if _, off := disabled[m.Name]; !off {
			enabledNames = append(enabledNames, m.Name)
		}
	}

	if len(enabledNames) == 0 {
		return skillDirs, nil, true, nil
	}
	if len(enabledNames) < len(allMeta) {
		return skillDirs, enabledNames, false, nil
	}
	return skillDirs, nil, false, nil
}
