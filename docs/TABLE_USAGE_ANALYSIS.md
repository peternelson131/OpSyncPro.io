# Table Usage Analysis

**Generated:** 2026-01-29T22:05:51.369Z  
**Production Project:** zxcdkanccbdeqebnabgg  
**Total Tables Analyzed:** 46

## Executive Summary

This report analyzes all tables in the Production database to determine their usage in the codebase and classify them for potential cleanup or archival.

### Summary Statistics

| Classification | Count | Description |
|----------------|-------|-------------|
| **Active** | 35 | Tables with code references and/or data |
| **Empty but Referenced** | 7 | Tables referenced in code but empty |
| **Indirect (FK only, has data)** | 0 | Referenced only via foreign keys, has data |
| **Indirect (FK only, empty)** | 0 | Referenced only via foreign keys, empty |
| **Orphaned (has data)** | 1 | ⚠️ No code refs, has data - review needed |
| **Orphaned (empty)** | 3 | ⚠️ No code refs, empty - candidates for deletion |

---

## Active (35 tables)

These tables are actively used in the codebase and have data. **No action needed.**

| Table Name | Row Count | Code References | FK References | Notes |
|------------|-----------|-----------------|---------------|-------|
| asin_correlation_feedback | 2 | 2 | 1 |  |
| asin_correlations | 856 | 19 | 0 |  |
| catalog_imports | 3,013 | 19 | 0 |  |
| crm_collaboration_types | 4 | 9 | 1 |  |
| crm_contact_sources | 7 | 9 | 1 |  |
| crm_marketplaces | 3 | 5 | 1 |  |
| crm_owners | 3 | 13 | 2 |  |
| crm_statuses | 16 | 17 | 1 |  |
| dubbing_jobs | 5 | 8 | 0 |  |
| ebay_aspect_keywords | 363 | 3 | 0 |  |
| ebay_aspect_misses | 3 | 10 | 0 |  |
| ebay_category_aspects | 9,326 | 1 | 0 |  |
| feedback | 6 | 109 | 0 | 🔥 Heavily used |
| import_jobs | 27 | 12 | 0 |  |
| influencer_tasks | 74 | 20 | 0 |  |
| listings | 756 | 269 | 1 | 🔥 Heavily used |
| marketplaces | 6 | 18 | 0 |  |
| oauth_states | 12 | 10 | 0 |  |
| post_results | 25 | 9 | 0 |  |
| posting_schedules | 2 | 12 | 0 |  |
| product_owners | 11 | 20 | 0 |  |
| product_videos | 13 | 44 | 4 |  |
| quick_list_settings | 1 | 5 | 0 |  |
| scheduled_posts | 19 | 22 | 0 |  |
| social_accounts | 3 | 17 | 1 |  |
| social_connections | 2 | 28 | 0 |  |
| social_posts | 14 | 17 | 1 |  |
| sourced_products | 379 | 62 | 2 | 🔥 Heavily used |
| strategies | 3 | 41 | 1 |  |
| system_state | 1 | 9 | 0 |  |
| thumbnail_templates | 2 | 12 | 0 |  |
| user_api_keys | 2 | 22 | 0 |  |
| user_onedrive_connections | 1 | 13 | 0 |  |
| users | 7 | 161 | 4 | 🔥 Heavily used |
| whatnot_analyses | 426 | 13 | 0 |  |

## Empty but Referenced (7 tables)

These tables are referenced in code but currently empty. May be new features or test tables.

| Table Name | Row Count | Code References | FK References | Notes |
|------------|-----------|-----------------|---------------|-------|
| api_usage | 0 | 1 | 0 |  |
| inbox_blocklist | 0 | 1 | 0 |  |
| inbox_conversations | 0 | 9 | 1 |  |
| inbox_messages | 0 | 4 | 0 |  |
| price_reduction_log | 0 | 3 | 0 |  |
| social_post_jobs | 0 | 11 | 0 |  |
| video_variants | 0 | 11 | 0 |  |

## Orphaned (has data) (1 tables)

⚠️ **ACTION REQUIRED:** These tables contain data but have no code references. Review before archiving.

| Table Name | Row Count | Code References | FK References | Notes |
|------------|-----------|-----------------|---------------|-------|
| sync_jobs | 52 | 0 | 0 |  |

### Detailed Analysis

#### sync_jobs

- **Row Count:** 52
- **Code References:** 0
- **FK References:** 0

## Orphaned (empty) (3 tables)

⚠️ **CANDIDATES FOR DELETION:** These tables are empty and have no code references.

| Table Name | Row Count | Code References | FK References | Notes |
|------------|-----------|-----------------|---------------|-------|
| amazon-influencer | ERROR | 0 | 0 | Table name has special chars - needs quoting |
| amazon-seller-central | ERROR | 0 | 0 | Table name has special chars - needs quoting |
| flip-alert-tasks | ERROR | 0 | 0 | Table name has special chars - needs quoting |

### Detailed Analysis

#### amazon-influencer

- **Row Count:** ERROR
- **Code References:** 0
- **FK References:** 0

#### amazon-seller-central

- **Row Count:** ERROR
- **Code References:** 0
- **FK References:** 0

#### flip-alert-tasks

- **Row Count:** ERROR
- **Code References:** 0
- **FK References:** 0

---

## Recommendations

### Immediate Actions

1. **Review Orphaned Tables with Data**
   - 1 tables contain data but aren't referenced in code
   - Determine if these are legacy tables that can be archived
   - Document any tables that should remain

2. **Clean Up Empty Orphaned Tables**
   - 3 tables are empty and unreferenced
   - These are safe to drop unless they're placeholders for future features
   - Recommended: Drop these tables or document their purpose

3. **Monitor Empty but Referenced Tables**
   - 7 tables are in code but have no data
   - These may be new features in development
   - Verify they're still needed or clean up unused code

### Code Reference Search Paths

The following directories were scanned for table references:
- `netlify/functions/**/*.js`
- `frontend/src/**/*.{js,jsx}`
- `supabase/functions/**/*.{ts,tsx}`
- `chrome-extension/**/*.js`

### Tables with Special Characters

The following tables have names with hyphens/special characters that may cause issues:
- `amazon-influencer`
- `amazon-seller-central`
- `flip-alert-tasks`

**Recommendation:** Consider renaming these tables to use underscores instead of hyphens.

---

## Detailed Table Reference Data

Full analysis data with code references is available at:
`/Users/jcsdirect/clawd/agents/backend/table_usage_analysis.json`

This JSON file contains:
- Exact file paths and line numbers for each code reference
- Complete foreign key relationship mappings
- Column counts and metadata

---

**Report prepared by:** Backend Agent  
**Analysis Method:** Automated code scanning + database introspection  
**Task:** UAT Table Parity + Unused Table Analysis
