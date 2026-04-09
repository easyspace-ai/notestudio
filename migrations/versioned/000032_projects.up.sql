-- Migration: 000032_projects
-- MetaNote: projects (1:1 knowledge base) and session.project_id

DO $$ BEGIN RAISE NOTICE '[Migration 000032] Creating projects table and sessions.project_id'; END $$;

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4(),
    uuid VARCHAR(36) NOT NULL,
    tenant_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    knowledge_base_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_projects_uuid UNIQUE (uuid),
    CONSTRAINT uq_projects_kb UNIQUE (knowledge_base_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS project_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(tenant_id, project_id);

COMMENT ON TABLE projects IS 'MetaNote project: one knowledge base per project; uuid is used in public URLs';
COMMENT ON COLUMN projects.uuid IS 'Stable public identifier for /projects/{uuid} routes';
COMMENT ON COLUMN sessions.project_id IS 'Optional link to MetaNote project';
