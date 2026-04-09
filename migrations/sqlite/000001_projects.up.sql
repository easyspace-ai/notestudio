-- SQLite: projects + sessions.project_id

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    tenant_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    knowledge_base_id VARCHAR(36) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);

ALTER TABLE sessions ADD COLUMN project_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(tenant_id, project_id);
