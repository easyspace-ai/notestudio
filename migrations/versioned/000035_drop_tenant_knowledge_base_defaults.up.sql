-- SaaS: KB default models come from platform model list (built-in + is_default), not per-tenant JSON.

ALTER TABLE tenants DROP COLUMN IF EXISTS knowledge_base_defaults;
