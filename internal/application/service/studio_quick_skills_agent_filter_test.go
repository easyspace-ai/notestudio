package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

type fakeSkillSvcForFilter struct {
	allowlist   []string
	allowlistNil bool
	disableAll  bool
	err         error
	filterOut   []string
	filterErr   error
}

func (f *fakeSkillSvcForFilter) ResolveAgentSkillAllowlist(context.Context) ([]string, []string, bool, error) {
	if f.err != nil {
		return nil, nil, false, f.err
	}
	if f.disableAll {
		return nil, nil, true, nil
	}
	if f.allowlistNil {
		return nil, nil, false, nil
	}
	return nil, f.allowlist, false, nil
}

func (f *fakeSkillSvcForFilter) FilterToEnabledSkillNames(_ context.Context, names []string) ([]string, error) {
	if f.filterErr != nil {
		return nil, f.filterErr
	}
	return f.filterOut, nil
}

func TestFilterStudioQuickManifestForAgentNilAgentReturnsCopy(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{{ID: "a"}}}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, nil, nil)
	if len(out.Items) != 1 || out.Items[0].ID != "a" {
		t.Fatalf("%+v", out)
	}
}

func TestFilterStudioQuickManifestForAgentSelected(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{
		{ID: "ppt-master"}, {ID: "webpage-generator"}, {ID: "x"},
	}}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{
		SkillsSelectionMode: "selected",
		SelectedSkills:      []string{"ppt-master", "x"},
	}}
	fake := &fakeSkillSvcForFilter{filterOut: []string{"ppt-master", "x"}}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, agent, fake)
	if len(out.Items) != 2 {
		t.Fatalf("%+v", out.Items)
	}
}

func TestFilterStudioQuickManifestForAgentAllWithAllowlist(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{
		{ID: "ppt-master"}, {ID: "webpage-generator"},
	}}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{SkillsSelectionMode: "all"}}
	fake := &fakeSkillSvcForFilter{allowlist: []string{"webpage-generator"}}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, agent, fake)
	if len(out.Items) != 1 || out.Items[0].ID != "webpage-generator" {
		t.Fatalf("%+v", out.Items)
	}
}

func TestFilterStudioQuickManifestForAgentNoneEmpty(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{{ID: "a"}}}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{SkillsSelectionMode: "none"}}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, agent, nil)
	if len(out.Items) != 0 {
		t.Fatalf("%+v", out.Items)
	}
}

func TestFilterStudioQuickManifestForAgentEmptyModeInfersSelected(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{
		{ID: "webpage-generator"}, {ID: "other"},
	}}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{
		SkillsSelectionMode: "",
		SelectedSkills:      []string{"webpage-generator"},
	}}
	fake := &fakeSkillSvcForFilter{filterOut: []string{"webpage-generator"}}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, agent, fake)
	if len(out.Items) != 1 || out.Items[0].ID != "webpage-generator" {
		t.Fatalf("%+v", out.Items)
	}
}

func TestFilterStudioQuickManifestForAgentUnsetModeEmptySelectedActsAsAll(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{
		{ID: "a"}, {ID: "b"},
	}}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{
		SkillsSelectionMode: "",
		SelectedSkills:      nil,
	}}
	fake := &fakeSkillSvcForFilter{allowlistNil: true}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, agent, fake)
	if len(out.Items) != 2 {
		t.Fatalf("expected full manifest, got %+v", out.Items)
	}
}

func TestFilterStudioQuickManifestForAgentSelectedFilterErrorUsesRaw(t *testing.T) {
	m := &types.StudioQuickSkillsManifest{Version: 1, Items: []types.StudioQuickSkillItem{
		{ID: "podcast-generation"}, {ID: "other"},
	}}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{
		SkillsSelectionMode: "selected",
		SelectedSkills:      []string{"podcast-generation"},
	}}
	fake := &fakeSkillSvcForFilter{filterErr: errors.New("read overrides failed")}
	out := FilterStudioQuickManifestForAgent(context.Background(), m, agent, fake)
	if len(out.Items) != 1 || out.Items[0].ID != "podcast-generation" {
		t.Fatalf("%+v", out.Items)
	}
}
