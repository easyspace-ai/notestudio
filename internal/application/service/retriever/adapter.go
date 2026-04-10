package retriever

import (
	"context"
	"fmt"
	"strconv"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// EngineAdapter wraps a low-level RetrieveEngine so it satisfies the
// higher-level types.Retriever interface.
type EngineAdapter struct {
	engine interfaces.RetrieveEngine
}

// NewEngineAdapter creates a new adapter for the given engine.
func NewEngineAdapter(engine interfaces.RetrieveEngine) *EngineAdapter {
	return &EngineAdapter{engine: engine}
}

// Retrieve converts RetrieveOptions into RetrieveParams, delegates to the
// underlying engine, and flattens RetrieveResult into SearchResults.
func (a *EngineAdapter) Retrieve(ctx context.Context, query string, opts types.RetrieveOptions) ([]*types.SearchResult, error) {
	params := types.RetrieveParams{
		Query:            query,
		Embedding:        opts.QueryEmbedding,
		TopK:             opts.TopK,
		Threshold:        opts.Threshold,
		KnowledgeBaseIDs: opts.SearchTargets.GetAllKnowledgeBaseIDs(),
		AdditionalParams: opts.Extra,
	}
	// If there is exactly one target with specific knowledge IDs, use them.
	if len(opts.SearchTargets) == 1 && len(opts.SearchTargets[0].KnowledgeIDs) > 0 {
		params.KnowledgeIDs = opts.SearchTargets[0].KnowledgeIDs
	}

	engineResults, err := a.engine.Retrieve(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("engine retrieve: %w", err)
	}

	var out []*types.SearchResult
	for _, rr := range engineResults {
		for _, idx := range rr.Results {
			sr := &types.SearchResult{
				ID:              idx.ID,
				Content:         idx.Content,
				KnowledgeID:     idx.KnowledgeID,
				KnowledgeBaseID: idx.KnowledgeBaseID,
				Score:           idx.Score,
				MatchType:       idx.MatchType,
				KnowledgeSource: strconv.Itoa(int(idx.SourceType)),
			}
			if idx.TagID != "" || idx.ChunkID != "" {
				if sr.Metadata == nil {
					sr.Metadata = make(map[string]string)
				}
				if idx.TagID != "" {
					sr.Metadata["tag_id"] = idx.TagID
				}
				if idx.ChunkID != "" {
					sr.Metadata["chunk_id"] = idx.ChunkID
				}
			}
			if sr.Metadata == nil {
				sr.Metadata = make(map[string]string)
			}
			sr.Metadata["is_enabled"] = strconv.FormatBool(idx.IsEnabled)
			out = append(out, sr)
		}
	}
	return out, nil
}
