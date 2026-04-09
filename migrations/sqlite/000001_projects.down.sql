DROP INDEX IF EXISTS idx_sessions_project_id;
ALTER TABLE sessions DROP COLUMN project_id;

DROP INDEX IF EXISTS idx_projects_tenant_id;
DROP TABLE IF EXISTS projects;
