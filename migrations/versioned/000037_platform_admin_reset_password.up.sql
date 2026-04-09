-- Reset platform admin password to default plain text "admin123" (bcrypt).
-- Fixes rows created with a wrong hash or manual inserts.
UPDATE platform_admins
SET password_hash = '$2a$10$cbhL0ErRbaqMLxTTbkgbYOts/TS.aU2mzgWUz6CSaj0l57rpCfWQa',
    updated_at = CURRENT_TIMESTAMP
WHERE LOWER(email) = 'admin@163.com';
