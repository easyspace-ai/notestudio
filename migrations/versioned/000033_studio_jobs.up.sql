-- Migration: 000033_studio_jobs — async Studio artifacts (HTML/slides/audio/mindmap)

DO $$ BEGIN RAISE NOTICE '[Migration 000033] Creating studio_jobs table'; END $$;

CREATE TABLE IF NOT EXISTS studio_jobs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    title VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_message TEXT,
    session_id VARCHAR(36),
    artifact_path TEXT,
    artifacts JSONB,
    input JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_studio_jobs_tenant_project_created
    ON studio_jobs (tenant_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_jobs_deleted_at ON studio_jobs (deleted_at);

COMMENT ON TABLE studio_jobs IS 'MetaNote Studio async generation jobs and artifact paths';
