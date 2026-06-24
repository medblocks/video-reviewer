-- Note: When using Docker, the database is created via POSTGRES_DB env var
-- For manual setup, run: CREATE DATABASE frame_note;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Annotations table
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL,  -- SHA-256 hash of video
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES annotations(id) ON DELETE CASCADE,  -- For replies
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    type VARCHAR(20) NOT NULL CHECK (type IN ('comment', 'drawing')),
    drawing_data JSONB,
    attachments JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster video lookups
CREATE INDEX IF NOT EXISTS idx_annotations_video_id ON annotations(video_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON annotations(user_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_annotations_start_time ON annotations(video_id, start_time);

-- Google Drive OAuth tokens (one row per app user)
CREATE TABLE IF NOT EXISTS drive_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,            -- only returned on first consent; preserved on refresh
    expiry_date BIGINT,            -- ms epoch (tokens.expiry_date from google-auth-library)
    scope TEXT,
    token_type VARCHAR(32),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

