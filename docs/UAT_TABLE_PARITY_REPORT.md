# UAT Table Parity Report

**Generated:** 2026-01-29T22:05:51.366Z  
**Production Project:** zxcdkanccbdeqebnabgg  
**UAT Project:** zzbzzpjqmbferplrwesn

## Executive Summary

✅ **Phase 1 Complete:** All missing tables and types have been synchronized from Production to UAT.

- **8 tables** deployed with full schema, constraints, indexes, and RLS policies
- **3 enum types** created
- **3 UAT-only tables** documented (not deleted)

---

## Deployed Tables

The following tables were extracted from Production and created in UAT:

| Table Name | Columns | RLS Policies | Indexes | Status |
|------------|---------|--------------|---------|--------|
| api_usage | 8 | ✅ | ✅ | Deployed (0 rows in prod) |
| asin_correlation_feedback | 8 | ✅ | ✅ | Deployed (2 rows in prod) |
| ebay_aspect_keywords | 6 | ✅ | ✅ | Deployed (363 rows in prod) |
| ebay_aspect_misses | 14 | ✅ | ✅ | Deployed (3 rows in prod) |
| ebay_category_aspects | 4 | ✅ | ✅ | Deployed (9326 rows in prod) |
| feedback | 8 | ✅ | ✅ | Deployed (6 rows in prod) |
| price_reduction_log | 13 | ✅ | ✅ | Deployed (0 rows in prod) |
| thumbnail_templates | 7 | ✅ | ✅ | Deployed (2 rows in prod) |

### Enum Types Deployed

- **listing_format**
- **listing_status**
- **reduction_strategy**

---

## UAT-Only Tables (Not in Production)

These tables exist in UAT but were **NOT** deleted during the sync process:

| Table Name | Row Count | Purpose |
|------------|-----------|---------|
| aspect_gaps | 0 | UAT-specific testing table |
| price_history | 0 | UAT-specific testing table |
| price_reduction_logs | 1 | UAT-specific testing table |

**Recommendation:** Review these tables with the team to determine if they should be:
1. Migrated to Production (if valuable)
2. Kept as UAT-only test fixtures
3. Archived or removed

---

## Schema Synchronization Details

### Method Used
1. Extracted schemas from Production using Supabase Management API
2. Generated CREATE TABLE/TYPE statements with proper:
   - Column definitions and data types
   - Primary keys and unique constraints
   - Foreign key relationships
   - Indexes (excluding auto-generated constraint indexes)
   - RLS policies with proper permissions
3. Deployed to UAT via Management API SQL execution

### RLS Policies Applied

All tables with RLS enabled in Production now have matching policies in UAT, including:
- Service role full access policies
- User-scoped read/write policies
- Authentication-based access controls

---

## Verification Steps

To verify the deployment:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'api_usage', 'asin_correlation_feedback', 'ebay_aspect_keywords',
    'ebay_aspect_misses', 'ebay_category_aspects', 'feedback',
    'price_reduction_log', 'thumbnail_templates'
  );

-- Check enum types exist
SELECT typname 
FROM pg_type 
WHERE typname IN ('listing_format', 'listing_status', 'reduction_strategy');

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = true;
```

---

## Migration SQL

The complete migration SQL has been generated and is available at:
- `/Users/jcsdirect/clawd/agents/backend/migration_to_uat.sql`
- Individual table SQL files in `/Users/jcsdirect/clawd/agents/backend/sql/`

---

## Next Steps

1. ✅ **Complete:** UAT database schema matches Production
2. ⏭️ **Recommended:** Run integration tests on UAT environment
3. ⏭️ **Recommended:** Verify RLS policies work as expected
4. ⏭️ **Action Required:** Review UAT-only tables for disposition

---

## Edge Functions

**Synced:** 2026-01-29

| Function | Status | Deployed to UAT | Responds (not 404) | Secrets Set |
|----------|--------|-----------------|---------------------|-------------|
| `asin-correlation` | ✅ ACTIVE | ✅ (existing) | ✅ | ✅ |
| `aspect-keyword-review` | ✅ ACTIVE | ✅ Deployed | ✅ (401 - auth required) | ✅ ANTHROPIC_API_KEY, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET |
| `crm-lookups` | ✅ ACTIVE | ✅ Deployed | ✅ (401 - auth required) | ✅ (Supabase keys only) |
| `crm-products` | ✅ ACTIVE | ✅ Deployed | ✅ (401 - auth required) | ✅ (Supabase keys only) |

**UAT Edge Function Secrets (8 total):**
- ANTHROPIC_API_KEY ✅
- EBAY_CLIENT_ID ✅
- EBAY_CLIENT_SECRET ✅
- KEEPA_API_KEY ✅
- SUPABASE_ANON_KEY ✅
- SUPABASE_DB_URL ✅
- SUPABASE_SERVICE_ROLE_KEY ✅
- SUPABASE_URL ✅

**Matches Production secrets:** ✅ All 8 secrets present in both environments

---

**Report prepared by:** Backend Agent + Main Agent  
**Task:** UAT Table Parity + Unused Table Analysis + Edge Function Deployment
