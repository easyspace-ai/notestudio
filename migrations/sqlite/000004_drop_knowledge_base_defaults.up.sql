-- SQLite 3.35+: drop tenant KB defaults column (platform-wide models only).

ALTER TABLE tenants DROP COLUMN knowledge_base_defaults;
