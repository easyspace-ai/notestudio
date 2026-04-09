-- Tenant-level defaults for new knowledge bases (embedding / summary / optional VLM model IDs).

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS knowledge_base_defaults JSONB DEFAULT NULL;

COMMENT ON COLUMN tenants.knowledge_base_defaults IS 'Default model IDs applied when creating a knowledge base without explicit embedding_model_id/summary_model_id';
