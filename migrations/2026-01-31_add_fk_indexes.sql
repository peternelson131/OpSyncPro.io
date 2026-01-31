-- Migration: Add missing foreign key indexes for performance
-- Generated: 2026-01-31
-- Target: Supabase UAT (zzbzzpjqmbferplrwesn)
-- Applied: 2026-01-31 00:06 CST

-- Background:
-- The Supabase linter flagged 13 foreign key columns without covering indexes.
-- Foreign keys without indexes can cause performance issues during JOINs and
-- cascade operations. This migration adds indexes to all flagged columns.

-- Total indexes created: 13

-- Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_price_history_listing_id ON public.price_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_price_reduction_logs_listing_id ON public.price_reduction_logs(listing_id);
CREATE INDEX IF NOT EXISTS idx_listings_strategy_id ON public.listings(strategy_id);
CREATE INDEX IF NOT EXISTS idx_sourced_products_collaboration_type_id ON public.sourced_products(collaboration_type_id);
CREATE INDEX IF NOT EXISTS idx_sourced_products_contact_source_id ON public.sourced_products(contact_source_id);
CREATE INDEX IF NOT EXISTS idx_sourced_products_marketplace_id ON public.sourced_products(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_video_id ON public.scheduled_posts(video_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON public.oauth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON public.import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_influencer_tasks_video_id ON public.influencer_tasks(video_id);
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_triggered_by ON public.price_reduction_log(triggered_by);
CREATE INDEX IF NOT EXISTS idx_mission_control_tasks_user_id ON public.mission_control_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON public.users(user_id);

-- Verification query (should return 0 rows):
-- SELECT t.relname as table_name, a.attname as column_name 
-- FROM pg_constraint c 
-- JOIN pg_class t ON c.conrelid = t.oid 
-- JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) 
-- WHERE c.contype = 'f' 
--   AND t.relnamespace = 'public'::regnamespace 
--   AND NOT EXISTS (
--     SELECT 1 FROM pg_index i 
--     WHERE i.indrelid = t.oid 
--     AND a.attnum = ANY(i.indkey)
--   );
