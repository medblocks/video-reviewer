-- Migration: Add status column to annotations for pending/completed tracking
-- Date: 2026-06-24

BEGIN;

ALTER TABLE annotations
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed'));

COMMIT;
