package types

import "context"

// Retriever is a unified, composable interface for retrieval pipelines.
// It abstracts over vector stores, keyword indexes, rerankers, mergers,
// and parent-child resolvers so that callers (Agent, RAG executor, etc.)
// consume a single, stable API.
type Retriever interface {
	// Retrieve returns relevant documents for the given query.
	// The implementation is responsible for all configured stages
	// (vector search, keyword search, reranking, merging, etc.).
	Retrieve(ctx context.Context, query string, opts RetrieveOptions) ([]*SearchResult, error)
}

// RetrieveStage is a discrete transformation step in a retrieval pipeline.
// Examples: reranking, deduplication, parent-chunk resolution, MMR.
type RetrieveStage func(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error)

// RetrieveOptions controls retrieval behavior.
// It is intentionally broader than RetrieveParams so that high-level
// callers (Agent, chat pipeline) do not need to know engine specifics.
type RetrieveOptions struct {
	// QueryEmbedding is the pre-computed query embedding.
	QueryEmbedding []float32
	// SearchTargets restricts the search scope.
	SearchTargets SearchTargets
	// TopK limits the number of final results.
	TopK int
	// Threshold is the minimum similarity / relevance score.
	Threshold float64
	// EnableRerank turns on the rerank stage.
	EnableRerank bool
	// RerankModelID selects the rerank model.
	RerankModelID string
	// RerankThreshold is the score floor after reranking.
	RerankThreshold float64
	// RerankTopK limits how many results the reranker returns.
	RerankTopK int
	// EnableParentChild turns on parent-chunk resolution.
	EnableParentChild bool
	// EnableMerge turns on deduplication and overlap merging.
	EnableMerge bool
	// FAQPriorityEnabled boosts FAQ chunks when true.
	FAQPriorityEnabled bool
	// FAQScoreBoost is the multiplier for FAQ scores.
	FAQScoreBoost float64
	// Extra holds arbitrary parameters for specialized retrievers.
	Extra map[string]interface{}
}
