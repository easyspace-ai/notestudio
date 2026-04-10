package service

import (
	"context"
	"strings"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
)

// studioQuickAgentSkillReader is the subset of SkillService needed to align Studio quick actions with agent skill policy.
type studioQuickAgentSkillReader interface {
	ResolveAgentSkillAllowlist(ctx context.Context) (skillDirs []string, allowed []string, disableAll bool, err error)
	FilterToEnabledSkillNames(ctx context.Context, names []string) ([]string, error)
}

// FilterStudioQuickManifestForAgent keeps only Studio quick rows whose id matches skills the agent may use
// (same rules as configureSkillsFromAgent in session_agent_qa).
func FilterStudioQuickManifestForAgent(
	ctx context.Context,
	m *types.StudioQuickSkillsManifest,
	agent *types.CustomAgent,
	skillSvc studioQuickAgentSkillReader,
) *types.StudioQuickSkillsManifest {
	empty := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{}}
	if m == nil {
		return empty
	}
	if agent == nil {
		out := *m
		return &out
	}

	// Align with admin AgentEditorModal: if mode was never persisted but selected_skills is set, treat as "selected".
	mode := strings.ToLower(strings.TrimSpace(agent.Config.SkillsSelectionMode))
	if mode == "" && len(agent.Config.SelectedSkills) > 0 {
		mode = "selected"
	}
	// builtin_agents.yaml 等可能未写 skills_selection_mode；此时与「全部 Skills」一致，否则默认智能体魔棒/侧栏永远为空。
	// 显式保存为 "none" 的仍为 none（见 default 分支）。
	if mode == "" && len(agent.Config.SelectedSkills) == 0 {
		mode = "all"
	}
	switch mode {
	case "all":
		_, allowed, disableAll, err := skillSvc.ResolveAgentSkillAllowlist(ctx)
		if err != nil || disableAll {
			return empty
		}
		if len(allowed) == 0 {
			out := *m
			return &out
		}
		return filterStudioQuickManifestBySkillIDs(m, allowed)
	case "selected":
		if len(agent.Config.SelectedSkills) == 0 {
			return empty
		}
		filtered, err := skillSvc.FilterToEnabledSkillNames(ctx, agent.Config.SelectedSkills)
		if err != nil {
			logger.Warnf(ctx, "studio-quick: FilterToEnabledSkillNames: %v; using raw selected_skills for manifest", err)
			filtered = append([]string(nil), agent.Config.SelectedSkills...)
		}
		if len(filtered) == 0 {
			return empty
		}
		return filterStudioQuickManifestBySkillIDs(m, filtered)
	default:
		// "none", "", or unknown → no quick actions (aligned with agent runtime)
		return empty
	}
}

func filterStudioQuickManifestBySkillIDs(m *types.StudioQuickSkillsManifest, allowed []string) *types.StudioQuickSkillsManifest {
	allow := make(map[string]struct{}, len(allowed))
	for _, n := range allowed {
		if n != "" {
			allow[n] = struct{}{}
		}
	}
	var out []types.StudioQuickSkillItem
	for _, it := range m.Items {
		if _, ok := allow[it.ID]; ok {
			out = append(out, it)
		}
	}
	return &types.StudioQuickSkillsManifest{Version: m.Version, Items: out}
}
