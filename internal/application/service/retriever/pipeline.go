package retriever

import (
	"context"
	"fmt"

	"github.com/Tencent/WeKnora/internal/types"
)

// Pipeline implements types.Retriever as a composable, multi-stage retrieval pipeline.
// Stages are executed in registration order.
type Pipeline struct {
	base   types.Retriever
	stages []types.RetrieveStage
}

// NewPipeline creates a retrieval pipeline from a base retriever and optional stages.
func NewPipeline(base types.Retriever, stages ...types.RetrieveStage) *Pipeline {
	return &Pipeline{
		base:   base,
		stages: stages,
	}
}

// WithStage appends a transformation stage and returns the pipeline for chaining.
func (p *Pipeline) WithStage(stage types.RetrieveStage) *Pipeline {
	p.stages = append(p.stages, stage)
	return p
}

// Retrieve runs the base retriever and then applies each stage in order.
func (p *Pipeline) Retrieve(ctx context.Context, query string, opts types.RetrieveOptions) ([]*types.SearchResult, error) {
	results, err := p.base.Retrieve(ctx, query, opts)
	if err != nil {
		return nil, fmt.Errorf("pipeline base retrieve: %w", err)
	}
	for i, stage := range p.stages {
		results, err = stage(ctx, query, results)
		if err != nil {
			return nil, fmt.Errorf("pipeline stage %d failed: %w", i, err)
		}
	}
	return results, nil
}
