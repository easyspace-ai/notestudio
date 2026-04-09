package service

import "github.com/Tencent/WeKnora/internal/types"

// PickPreferredActiveModelID chooses one active model of the given type.
// For KB creation, callers pass only the platform catalog (is_builtin models). Score = (built-in ? 2 : 0) + (default ? 1 : 0).
func PickPreferredActiveModelID(models []*types.Model, want types.ModelType) string {
	bestID := ""
	bestScore := -1
	for _, m := range models {
		if m == nil || m.Type != want || m.Status != types.ModelStatusActive {
			continue
		}
		score := 0
		if m.IsBuiltin {
			score += 2
		}
		if m.IsDefault {
			score += 1
		}
		if score > bestScore {
			bestScore = score
			bestID = m.ID
		}
	}
	return bestID
}
