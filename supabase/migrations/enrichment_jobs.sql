-- Create enrichment_jobs table for tracking async Keepa enrichment
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_batch_id uuid,  -- Optional reference to import batch (no FK since table may not exist)
  
  -- Progress tracking
  total_count int NOT NULL DEFAULT 0,
  processed_count int NOT NULL DEFAULT 0,
  enriched_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  
  -- Keepa API usage tracking
  tokens_consumed int NOT NULL DEFAULT 0,
  
  -- Job status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS policies
ALTER TABLE enrichment_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own enrichment jobs
CREATE POLICY "Users can view own enrichment jobs"
  ON enrichment_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert/update enrichment jobs
CREATE POLICY "Service role can manage enrichment jobs"
  ON enrichment_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- Create index for efficient queries
CREATE INDEX idx_enrichment_jobs_user_status ON enrichment_jobs(user_id, status);
CREATE INDEX idx_enrichment_jobs_batch ON enrichment_jobs(import_batch_id);

-- Add enrichment_status column to catalog_imports
ALTER TABLE catalog_imports 
  ADD COLUMN IF NOT EXISTS enrichment_status text 
  CHECK (enrichment_status IN ('pending', 'enriched', 'failed', 'unavailable'));

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_catalog_imports_enrichment_status 
  ON catalog_imports(user_id, enrichment_status);

-- Enable realtime for enrichment_jobs table (for progress updates)
ALTER PUBLICATION supabase_realtime ADD TABLE enrichment_jobs;

COMMENT ON TABLE enrichment_jobs IS 'Tracks async Keepa enrichment jobs for catalog imports';
COMMENT ON COLUMN catalog_imports.enrichment_status IS 'Keepa enrichment status: pending, enriched, failed, or unavailable';
