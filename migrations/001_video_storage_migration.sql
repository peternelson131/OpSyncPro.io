-- Migration: Video Storage - OneDrive to Supabase Storage
-- Environment: UAT ONLY
-- Project: zzbzzpjqmbferplrwesn
-- Date: 2026-01-30

-- ============================================
-- 1. Modify product_videos table
-- ============================================

-- Make OneDrive columns nullable (were NOT NULL)
ALTER TABLE product_videos 
  ALTER COLUMN onedrive_file_id DROP NOT NULL,
  ALTER COLUMN onedrive_path DROP NOT NULL;

-- Add Supabase Storage columns
ALTER TABLE product_videos 
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_url TEXT;

-- Add OneDrive sync tracking
ALTER TABLE product_videos 
  ADD COLUMN IF NOT EXISTS onedrive_sync_status TEXT DEFAULT 'disabled'
  CHECK (onedrive_sync_status IN ('disabled', 'pending', 'syncing', 'synced', 'failed'));

ALTER TABLE product_videos 
  ADD COLUMN IF NOT EXISTS onedrive_sync_error TEXT;

-- Index for sync jobs
CREATE INDEX IF NOT EXISTS idx_product_videos_sync_status 
  ON product_videos(onedrive_sync_status) 
  WHERE onedrive_sync_status IN ('pending', 'syncing');

-- Comments
COMMENT ON COLUMN product_videos.storage_path IS 'Path in Supabase Storage product-videos bucket';
COMMENT ON COLUMN product_videos.storage_url IS 'Public URL for direct access to video file';
COMMENT ON COLUMN product_videos.onedrive_sync_status IS 'Optional OneDrive sync: disabled (no sync), pending (queued), syncing (in progress), synced (done), failed';

-- ============================================
-- 2. Drop old unique constraint, add new one
-- ============================================

-- Drop unique constraint on (user_id, onedrive_file_id) since onedrive_file_id will be null
ALTER TABLE product_videos DROP CONSTRAINT IF EXISTS product_videos_user_id_onedrive_file_id_key;

-- Add unique constraint on storage_path
ALTER TABLE product_videos ADD CONSTRAINT product_videos_storage_path_unique UNIQUE (storage_path);

-- ============================================
-- 3. Modify video_variants table
-- ============================================

-- Add Supabase Storage columns to video_variants
ALTER TABLE video_variants
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_url TEXT;

COMMENT ON COLUMN video_variants.storage_path IS 'Path in Supabase Storage for dubbed video variant';
COMMENT ON COLUMN video_variants.storage_url IS 'Public URL for dubbed video variant';
