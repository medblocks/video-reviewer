-- Migration: Add drive_tokens table for Google Drive OAuth integration
-- Date: 2026-06-23

BEGIN;

CREATE TABLE IF NOT EXISTS drive_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,            -- only returned on first consent; preserved on refresh
    expiry_date BIGINT,            -- ms epoch (tokens.expiry_date from google-auth-library)
    scope TEXT,
    token_type VARCHAR(32),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
