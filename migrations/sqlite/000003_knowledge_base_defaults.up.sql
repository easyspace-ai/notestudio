-- SQLite: tenant-level defaults for new knowledge bases (JSON text).

ALTER TABLE tenants ADD COLUMN knowledge_base_defaults TEXT DEFAULT NULL;
