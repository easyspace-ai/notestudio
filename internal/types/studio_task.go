package types

// StudioGeneratePayload is enqueued after a studio_jobs row is created (pending).
// Task type string: TypeStudioGenerate in extract_graph.go
type StudioGeneratePayload struct {
	RequestID         string `json:"request_id,omitempty"`
	TenantID          uint64 `json:"tenant_id"`
	JobID             string `json:"job_id"`
	ProjectID         string `json:"project_id"`
	KnowledgeBaseID   string `json:"knowledge_base_id"`
	Kind              string `json:"kind"`
	Title             string `json:"title"`
	SessionID         string `json:"session_id,omitempty"`
	Language          string `json:"language,omitempty"`
}
