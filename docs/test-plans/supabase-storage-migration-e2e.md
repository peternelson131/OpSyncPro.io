# E2E Test Plan: Supabase Storage Migration

**Environment:** UAT ONLY (https://uat.opsyncpro.io)
**Date:** 2026-01-30
**Scope:** Full video lifecycle after OneDrive → Supabase Storage migration

---

## Test Prerequisites
- UAT site deployed and accessible
- UAT Chrome extension loaded (at `/Users/jcsdirect/clawd/projects/ebay-price-reducer/chrome-extension-uat/`)
- Test user authenticated on UAT
- At least one product in Product CRM

---

## Test Suite 1: Happy Path — Full Video Lifecycle

### T1.1: CSV Import
1. Create a test CSV with 1-2 new ASINs
2. Navigate to Catalog Import (`/asin-lookup#catalog-import`)
3. Upload the CSV
4. **Verify:** Records appear in `sourced_products` table
5. **Verify:** Products appear in Product CRM
6. **Screenshot:** Product CRM showing imported product

### T1.2: Video Upload (Supabase Storage)
1. Navigate to Product CRM → select a product
2. Upload a small test video (.mp4, <10MB)
3. **Verify:** Upload succeeds WITHOUT OneDrive being connected
4. **Verify:** `product_videos` record has `storage_path` populated (format: `{userId}/{productId}/{filename}`)
5. **Verify:** `product_videos` record has `storage_url` populated (Supabase public URL)
6. **Verify:** `onedrive_file_id` is NULL (not sent to OneDrive)
7. **Verify:** Video file exists in Supabase Storage bucket `product-videos`
8. **Screenshot:** Database record showing storage_path/storage_url

### T1.3: Video Playback
1. In VideoGallery, click the uploaded video to play
2. **Verify:** Video plays using direct Supabase Storage URL (not video-download endpoint)
3. **Verify:** No OneDrive-related errors in console
4. **Screenshot:** Video playing in the gallery

### T1.4: Thumbnail Generation
1. Click "Generate Thumbnail" for the product with a video
2. **Verify:** Thumbnail is generated
3. **Verify:** Thumbnail URL is accessible
4. **Screenshot:** Product showing thumbnail

### T1.5: OneDrive Sync (if connected)
1. If OneDrive is connected, verify sync status field
2. **Verify:** `onedrive_sync_status` reflects correct state
3. If NOT connected, verify upload still works without OneDrive
4. **Verify:** No errors about missing OneDrive connection

### T1.6: Chrome Extension — Download Video & Thumbnail
1. Open Chrome extension side panel on Amazon
2. **Verify:** Tasks are visible with video thumbnails
3. Click to download/use the video
4. **Verify:** Video downloads successfully from Supabase Storage URL
5. **Verify:** Thumbnail downloads successfully
6. **Screenshot:** Extension showing downloadable video + thumbnail

---

## Test Suite 2: Non-Happy Path — Error Cases & Edge Cases

### T2.1: Delete Video After Upload
1. Upload a video to a product
2. Delete the video from the gallery
3. **Verify:** `product_videos` record is removed or marked deleted
4. **Verify:** File is removed from Supabase Storage bucket
5. **Verify:** Product no longer shows "Has Video" in CRM
6. **Screenshot:** Before and after deletion

### T2.2: Upload Invalid File Type
1. Try uploading a non-video file (e.g., .txt, .pdf)
2. **Verify:** Upload is rejected with appropriate error message
3. **Screenshot:** Error message shown

### T2.3: Upload Oversized File
1. Try uploading a file >500MB (or simulate the check)
2. **Verify:** Upload is rejected with size limit error
3. **Screenshot:** Error message shown

### T2.4: Upload Without Product Selection
1. Try uploading a video without associating it to a product
2. **Verify:** Appropriate error or handling

### T2.5: Legacy OneDrive Video Playback
1. Find a video that only has `onedrive_file_id` (no `storage_url`)
2. **Verify:** Video still plays via OneDrive fallback (video-download endpoint)
3. If no legacy videos exist, note this — it means backward compatibility can't be tested yet

### T2.6: Double Upload (Same File)
1. Upload the same video file twice to the same product
2. **Verify:** Appropriate handling (error, overwrite, or creates second entry)

### T2.7: PWA Mobile Upload
1. Navigate to PWAHome
2. Upload a video through the mobile flow
3. **Verify:** Upload goes to Supabase Storage (same as desktop flow)
4. **Verify:** `storage_path` and `storage_url` populated

---

## Verification Methods

| Check | Method |
|-------|--------|
| Database records | Query Supabase directly via Management API |
| Storage bucket files | List files in `product-videos` bucket via API |
| Video playback | Browser tool - navigate and play |
| Chrome extension | Browser tool - open extension side panel |
| Error messages | Browser tool - check console + UI |
| OneDrive sync | Check `onedrive_sync_status` column |

---

## Pass Criteria

**PASS:** All T1.x tests pass + at least T2.1 (delete) passes
**PARTIAL:** T1.1-T1.3 pass but some T2.x fail
**FAIL:** Any T1.1-T1.3 test fails (core upload/playback broken)
