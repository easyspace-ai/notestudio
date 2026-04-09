-- SQLite: studio_jobs

CREATE TABLE IF NOT EXISTS studio_jobs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    title VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_message TEXT,
    session_id VARCHAR(36),
    artifact_path TEXT,
    artifacts TEXT,
    input TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_studio_jobs_tenant_project_created
    ON studio_jobs (tenant_id, project_id, created_at DESC);
