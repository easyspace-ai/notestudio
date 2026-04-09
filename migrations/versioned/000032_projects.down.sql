-- Rollback: 000032_projects

DROP INDEX IF EXISTS idx_sessions_project_id;
ALTER TABLE sessions DROP COLUMN IF EXISTS project_id;

DROP INDEX IF EXISTS idx_projects_deleted_at;
DROP INDEX IF EXISTS idx_projects_tenant_id;
DROP TABLE IF EXISTS projects;
