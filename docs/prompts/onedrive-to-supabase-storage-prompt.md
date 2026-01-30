# Task: Migrate Video Storage from OneDrive to Supabase Storage (Option A)

**Command:** `/ship`
**Environment:** UAT ONLY (https://uat.opsyncpro.io)
**Project:** `/Users/jcsdirect/clawd/projects/ebay-price-reducer`
**Branch:** `uat`
**Supabase Project (UAT):** `zzbzzpjqmbferplrwesn`

---

## Objective

Migrate the video/file storage system from OneDrive (primary) to Supabase Storage (primary), with OneDrive becoming an optional background sync. This touches the upload flow, video playback, social posting, dubbing, and transcoding.

**Current state:** OneDrive is the ONLY storage location for videos. Every downstream feature (social posting, dubbing, YouTube upload) must download from OneDrive via OAuth + Microsoft Graph API. 22 backend functions depend on OneDrive.

**Target state:** Supabase Storage is primary. Videos upload directly to Supabase. All downstream features read from Supabase. If user has OneDrive connected, files are optionally copied there as a background sync.

---

## Database Changes

### 1. Modify `product_videos` Table

The table currently requires `onedrive_file_id` and `onedrive_path` as NOT NULL. These must become nullable, and new Supabase Storage columns added.

```sql
-- Make OneDrive columns nullable (were NOT NULL)
ALTER TABLE product_videos 
  ALTER COLUMN onedrive_file_id DROP NOT NULL,
  ALTER COLUMN onedrive_path DROP NOT NULL;

-- Add Supabase Storage columns
ALTER TABLE product_videos 
  ADD COLUMN IF NOT EXISTS storage_path TEXT,           -- e.g., "{user_id}/{product_id}/{filename}"
  ADD COLUMN IF NOT EXISTS storage_url TEXT;             -- Public URL from Supabase Storage

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
```

### 2. Create Supabase Storage Bucket

```sql
-- Create the product-videos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos', 
  'product-videos', 
  true,                                    -- Public read access
  524288000,                               -- 500MB max file size
  ARRAY['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
);

-- RLS: Anyone can read (public bucket)
CREATE POLICY "Public can read product videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-videos');

-- RLS: Authenticated users can upload to their own folder
CREATE POLICY "Users can upload own product videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-videos' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: Users can delete their own videos
CREATE POLICY "Users can delete own product videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 3. Create `video_variants` Storage Support

The dubbed video variants also use OneDrive. Add Supabase Storage columns if not present:

```sql
-- Check if video_variants needs storage columns
ALTER TABLE video_variants
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_url TEXT;
```

---

## Backend Changes

### Phase 1: Upload Flow — New Videos Go to Supabase

#### 1A. New Function: `video-upload.js`

Create a new function that handles direct upload to Supabase Storage. This replaces the `onedrive-upload-session.js` flow for new uploads.

**Purpose:** Accept video file metadata, return a Supabase Storage upload URL or handle the upload server-side.

**Approach:** Use Supabase JS client's `storage.from('product-videos').upload()` or create a signed upload URL for the frontend to upload directly.

```
POST /video-upload
Body: { productId, filename, fileSize, mimeType }

Response: {
  uploadUrl: string,     // Signed URL for direct upload from frontend
  storagePath: string,   // Where the file will live
  videoId: string        // Pre-created product_videos record ID
}
```

**Flow:**
1. Verify auth
2. Create `product_videos` record with `upload_status: 'uploading'`, `storage_path` pre-set
3. Generate signed upload URL for the frontend to PUT the file directly
4. Return upload URL + video ID

**Alternative simpler approach:** Frontend uses `supabase.storage.from('product-videos').upload()` directly (no custom function needed — Supabase JS SDK handles this). The function would then just save metadata after upload completes.

#### 1B. Modify `videos.js` — `handlePost()` (line ~303)

Currently requires `onedrive_file_id` as mandatory. Change to support Supabase Storage as primary:

**Current:**
```javascript
if (!onedrive_file_id || !filename) {
  throw new Error('onedrive_file_id and filename are required');
}
```

**Change to:**
```javascript
if (!filename) {
  throw new Error('filename is required');
}
// Either storage_path (Supabase) or onedrive_file_id (legacy) must be provided
if (!storage_path && !onedrive_file_id) {
  throw new Error('Either storage_path or onedrive_file_id is required');
}
```

**Update the INSERT/UPDATE to include new columns:**
```javascript
// New fields from body
const { storage_path, storage_url } = body;

// INSERT
const { data: created } = await supabase
  .from('product_videos')
  .insert({
    user_id: userId,
    product_id: productId || null,
    storage_path: storage_path || null,
    storage_url: storage_url || null,
    onedrive_file_id: onedrive_file_id || null,  // Now optional
    onedrive_path: onedrive_path || null,          // Now optional
    filename,
    file_size: file_size || null,
    mime_type: mime_type || null,
    upload_status: 'complete'
  })
  .select()
  .single();
```

**Remove the UNIQUE constraint on `(user_id, onedrive_file_id)` since onedrive_file_id will be null for new uploads:**
```sql
ALTER TABLE product_videos DROP CONSTRAINT IF EXISTS product_videos_user_id_onedrive_file_id_key;
-- Add new unique constraint on storage_path instead
ALTER TABLE product_videos ADD CONSTRAINT product_videos_storage_path_unique UNIQUE (storage_path);
```

#### 1C. Modify `onedrive-upload-session.js`

Don't delete this function — it's still needed for OneDrive sync. But the frontend will no longer call it as the primary upload path.

---

### Phase 2: Video Playback — Read from Supabase

#### 2A. Modify `video-download.js` (112 lines)

Currently downloads exclusively from OneDrive. Add Supabase Storage as primary source:

**New logic:**
```javascript
// 1. Check if video has a Supabase Storage URL (new primary)
if (video.storage_url) {
  return successResponse({
    success: true,
    downloadUrl: video.storage_url,  // Direct public URL — no auth needed
    filename: video.filename,
    fileSize: video.file_size
  }, headers);
}

// 2. Fallback to OneDrive for legacy videos
if (video.onedrive_file_id || video.onedrive_path) {
  // ... existing OneDrive download logic ...
}

// 3. No storage location found
return errorResponse(400, 'Video has no storage location', headers);
```

#### 2B. Modify `VideoGallery.jsx` (491 lines)

**File:** `frontend/src/components/onedrive/VideoGallery.jsx`

The video gallery fetches download URLs via `video-download` endpoint. With Supabase URLs, the frontend can use them directly without the backend round-trip:

```javascript
// If video has storage_url, use it directly (no API call needed)
if (video.storage_url) {
  setStreamUrl(video.storage_url);
} else {
  // Legacy: fetch from video-download endpoint (OneDrive path)
  const response = await fetch(`/.netlify/functions/video-download?videoId=${video.id}`, ...);
  // ... existing code
}
```

---

### Phase 3: Frontend Upload Flow

#### 3A. Modify `VideoUploader.jsx` (369 lines)

**File:** `frontend/src/components/onedrive/VideoUploader.jsx`

Currently creates a OneDrive upload session and uploads chunks to Microsoft Graph. Change to upload to Supabase Storage:

**New flow:**
```javascript
// 1. Upload file to Supabase Storage
const storagePath = `${userId}/${productId}/${filename}`;
const { data, error } = await supabase.storage
  .from('product-videos')
  .upload(storagePath, file, {
    contentType: file.type,
    upsert: true
  });

// 2. Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('product-videos')
  .getPublicUrl(storagePath);

// 3. Save metadata via existing videos.js POST endpoint
const response = await fetch('/.netlify/functions/videos', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId,
    storage_path: storagePath,
    storage_url: publicUrl,
    filename: file.name,
    file_size: file.size,
    mime_type: file.type
  })
});
```

**Progress tracking:** Supabase JS SDK doesn't have built-in upload progress. For large files, use `tus` resumable upload protocol which Supabase supports:
```javascript
const { data, error } = await supabase.storage
  .from('product-videos')
  .upload(storagePath, file, {
    upsert: true,
    // For files > 6MB, uses resumable upload automatically
  });
```

Or use the `@supabase/storage-js` TUS integration for progress callbacks on large files.

**Remove:**
- OneDrive upload session creation
- Chunked upload to Microsoft Graph
- OneDrive connection requirement check

**Keep:**
- File validation (size, type)
- Progress UI (adapt to new upload method)
- Product association logic
- Video title generation trigger

#### 3B. Modify `PWAHome.jsx` — Mobile Upload

**File:** `frontend/src/pages/PWAHome.jsx` (lines 136-210)

Same changes as VideoUploader — upload to Supabase instead of OneDrive:

**Current (lines 152-205):**
```javascript
// Creates OneDrive upload session, uploads chunks to Microsoft Graph
const sessionResponse = await fetch('/.netlify/functions/onedrive-upload-session', ...);
const oneDriveFile = await uploadChunked(file, sessionData.uploadUrl, setUploadProgress);
// Saves with onedrive_file_id
```

**Change to:**
```javascript
// Upload directly to Supabase Storage
const storagePath = `${userId}/${selectedProduct.id}/${uploadFilename}`;
const { error: uploadError } = await supabase.storage
  .from('product-videos')
  .upload(storagePath, file, { contentType: file.type, upsert: true });

const { data: { publicUrl } } = supabase.storage
  .from('product-videos')
  .getPublicUrl(storagePath);

// Save metadata
const saveResponse = await fetch('/.netlify/functions/videos', {
  method: 'POST',
  body: JSON.stringify({
    productId: selectedProduct.id,
    storage_path: storagePath,
    storage_url: publicUrl,
    filename: uploadFilename,
    file_size: file.size,
    mime_type: file.type
  })
});
```

---

### Phase 4: Social Posting — Read from Supabase

#### 4A. Modify `social-post-processor-background.js` (462 lines)

All three posting functions (YouTube, Facebook, Instagram) download from OneDrive. Change to prefer Supabase Storage:

**Pattern to apply in `postToYouTube()`, `postToFacebook()`, `postToInstagram()`:**

```javascript
// NEW: Prefer Supabase Storage URL
let videoBuffer;

if (video.social_ready_url) {
  // Already transcoded in Supabase Storage
  const response = await fetch(video.social_ready_url);
  videoBuffer = await response.arrayBuffer();
} else if (video.storage_url) {
  // Original in Supabase Storage
  const response = await fetch(video.storage_url);
  videoBuffer = await response.arrayBuffer();
} else if (video.onedrive_file_id) {
  // Legacy: download from OneDrive
  const { accessToken: onedriveToken } = await getValidAccessToken(userId);
  const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
  const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${onedriveToken}` } });
  videoBuffer = await response.arrayBuffer();
} else {
  throw new Error('No video storage location found');
}
```

Apply this pattern in these functions within the file:
- `postToYouTube()` (around line 134)
- `postToFacebook()` (around line 241)
- `postToInstagram()` (around line ~300)

#### 4B. Modify `youtube-post.js` (256 lines)

Same pattern — prefer `storage_url` over OneDrive download. Around line 77-90:

```javascript
// Current: downloads from OneDrive
const onedriveToken = await getAccessToken(userId);
const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;

// Change to: prefer Supabase
let videoBuffer;
if (video.storage_url) {
  const resp = await fetch(video.storage_url);
  videoBuffer = Buffer.from(await resp.arrayBuffer());
} else if (video.onedrive_file_id) {
  // Legacy OneDrive fallback
  const onedriveToken = await getAccessToken(userId);
  const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
  const resp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${onedriveToken}` } });
  videoBuffer = Buffer.from(await resp.arrayBuffer());
} else {
  throw new Error('No video source available');
}
```

#### 4C. Modify `youtube-scheduled-post.js` (283 lines)

Same pattern. Around line 117-125 where it downloads from OneDrive.

#### 4D. Modify `meta-post.js` (528 lines)

Same pattern. Multiple locations where it fetches from OneDrive.

#### 4E. Modify `social-post.js` (943 lines)

Check for any direct OneDrive downloads here and apply the same fallback pattern.

---

### Phase 5: Dubbing — Read/Write Supabase

#### 5A. Modify `dub-onedrive-video.js` (228 lines)

Currently: Download from OneDrive → send to ElevenLabs → download result → upload back to OneDrive.

**Change:** Download from Supabase → send to ElevenLabs → download result → upload to Supabase.

```javascript
// Download source video
let videoBuffer;
if (video.storage_url) {
  const resp = await fetch(video.storage_url);
  videoBuffer = Buffer.from(await resp.arrayBuffer());
} else if (video.onedrive_file_id) {
  // Legacy OneDrive
  const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
  const resp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${onedriveToken}` } });
  videoBuffer = Buffer.from(await resp.arrayBuffer());
}

// ... ElevenLabs dubbing (unchanged) ...

// Save dubbed result to Supabase Storage (instead of OneDrive)
const dubbedPath = `${userId}/${videoId}/dubbed-${language}.mp4`;
await supabase.storage.from('dubbed-videos').upload(dubbedPath, dubbedBuffer, {
  contentType: 'video/mp4',
  upsert: true
});
const { data: { publicUrl } } = supabase.storage.from('dubbed-videos').getPublicUrl(dubbedPath);

// Update variant record with Supabase URL
await supabase.from('video_variants').update({
  storage_path: dubbedPath,
  storage_url: publicUrl,
  status: 'complete'
}).eq('id', variantId);
```

#### 5B. Modify `check-dub-status.js` (241 lines)

Update to read/write Supabase Storage paths instead of OneDrive paths.

#### 5C. Modify `video-variants.js` (286 lines)

Remove OneDrive folder creation (`ensureLanguageFolder`). Update to use Supabase Storage for dubbed video storage.

---

### Phase 6: Transcoding — Simplify

#### 6A. Modify `video-transcode-background.js` (280 lines)

Currently downloads from OneDrive → transcodes → uploads to Supabase Storage.

**Simplify:** Download from Supabase Storage (already there!) → transcode → upload transcoded version to Supabase Storage.

```javascript
// Current: downloadFromOneDrive(userId, onedriveFileId)
// Change to:
async function downloadVideo(video) {
  if (video.storage_url) {
    const response = await fetch(video.storage_url);
    return { buffer: Buffer.from(await response.arrayBuffer()) };
  }
  // Legacy fallback
  if (video.onedrive_file_id) {
    return await downloadFromOneDrive(video.user_id, video.onedrive_file_id);
  }
  throw new Error('No video source available');
}
```

---

### Phase 7: Optional OneDrive Sync (Background Job)

#### 7A. New Function: `onedrive-sync-background.js`

Background function that copies videos from Supabase to OneDrive for users who have connected OneDrive and enabled sync.

```
Trigger: Called after video upload completes (fire-and-forget from videos.js)

Flow:
1. Check if user has OneDrive connected
2. If no → set sync_status = 'disabled', return
3. Download video from Supabase Storage
4. Upload to user's OneDrive folder via Graph API
5. Update product_videos with onedrive_file_id and sync_status = 'synced'
```

**This is the lowest priority phase.** It can be implemented after everything else works.

#### 7B. UI: OneDrive Sync Toggle

In the Integrations/Settings page, add a toggle:
- "Sync videos to OneDrive" (only visible when OneDrive is connected)
- Shows sync status per video in the gallery

---

### Phase 8: Cleanup Legacy Functions

These functions become OneDrive-sync-only (not part of core flow):

| Function | New Role |
|----------|----------|
| `onedrive-auth-start.js` | Keep — used for optional OneDrive connection |
| `onedrive-callback.js` | Keep — used for optional OneDrive connection |
| `onedrive-disconnect.js` | Keep |
| `onedrive-status.js` | Keep |
| `onedrive-folders.js` | Keep — used by sync to pick folder |
| `onedrive-set-folder.js` | Keep — used by sync to set target folder |
| `onedrive-upload-session.js` | Keep — used by sync background job |
| `get-thumbnail.js` | **Remove** — thumbnails now in Supabase Storage |
| `thumbnail-folder.js` | **Remove** — no longer needed |
| `utils/onedrive-api.js` | Keep — used by sync |
| `utils/onedrive-encryption.js` | Keep — used by sync |

---

## Frontend Changes Summary

| File | Changes |
|------|---------|
| `frontend/src/components/onedrive/VideoUploader.jsx` | Upload to Supabase instead of OneDrive. Remove OneDrive connection requirement. |
| `frontend/src/components/onedrive/VideoGallery.jsx` | Use `storage_url` directly when available. Fallback to `video-download` endpoint for legacy. |
| `frontend/src/pages/PWAHome.jsx` | Upload to Supabase instead of OneDrive. Remove OneDrive connection check. |
| `frontend/src/pages/Integrations.jsx` | OneDrive section becomes "Sync" feature. Add toggle for auto-sync. |
| `frontend/src/pages/ProductCRM.jsx` | Update video references if needed (may be minimal). |

---

## Backend Changes Summary

| File | Lines | Change Type | Priority |
|------|-------|-------------|----------|
| `videos.js` | 693 | Modify POST handler — accept `storage_path`/`storage_url`, make `onedrive_file_id` optional | P0 |
| `video-download.js` | 112 | Add Supabase Storage as primary source, OneDrive as fallback | P0 |
| `social-post-processor-background.js` | 462 | Prefer `storage_url` over OneDrive download in all 3 posting functions | P1 |
| `youtube-post.js` | 256 | Same pattern — prefer Supabase | P1 |
| `youtube-scheduled-post.js` | 283 | Same pattern — prefer Supabase | P1 |
| `meta-post.js` | 528 | Same pattern — prefer Supabase | P1 |
| `social-post.js` | 943 | Same pattern — prefer Supabase | P1 |
| `dub-onedrive-video.js` | 228 | Download from Supabase, save dubbed result to Supabase | P1 |
| `video-variants.js` | 286 | Remove OneDrive folder creation, use Supabase Storage | P1 |
| `check-dub-status.js` | 241 | Update storage references | P1 |
| `video-transcode-background.js` | 280 | Download from Supabase instead of OneDrive | P1 |
| `influencer-tasks.js` | 256 | Minor: update video references if needed | P2 |
| `get-thumbnail.js` | 166 | **Remove** (thumbnails handled separately now) | P2 |
| `thumbnail-folder.js` | 90 | **Remove** | P2 |
| NEW: `onedrive-sync-background.js` | ~150 | Background job to sync to OneDrive (optional) | P3 |

---

## Implementation Order

### Step 1: Database + Storage Setup
- Run SQL migrations on UAT Supabase
- Create `product-videos` bucket with RLS policies
- Verify bucket is public and accepts uploads

### Step 2: Backend — Upload + Playback (Core Flow)
- Modify `videos.js` POST handler
- Modify `video-download.js` (Supabase primary, OneDrive fallback)

### Step 3: Frontend — Upload Flow
- Modify `VideoUploader.jsx` (upload to Supabase)
- Modify `PWAHome.jsx` (upload to Supabase)
- Modify `VideoGallery.jsx` (play from Supabase URL)

### Step 4: Backend — Downstream Consumers
- Modify all social posting functions (prefer Supabase)
- Modify dubbing functions (prefer Supabase)
- Modify transcoding (prefer Supabase)

### Step 5: Cleanup + Optional Sync
- Remove `get-thumbnail.js` and `thumbnail-folder.js`
- Create `onedrive-sync-background.js` (optional)
- Update Integrations page

---

## Credentials

All in `~/clawd/secrets/credentials.json`:
- `supabase.accessToken` — Supabase Management API
- UAT project ref: `zzbzzpjqmbferplrwesn`
- Microsoft OAuth credentials already in Netlify env vars (for optional sync)

---

## Testing Procedure

### Test 1: Upload New Video
1. Go to Product CRM → select a product
2. Upload a video file
3. Verify file appears in Supabase Storage `product-videos` bucket
4. Verify `product_videos` record has `storage_path` and `storage_url`
5. Verify video plays in the gallery

### Test 2: Video Playback
1. Click play on newly uploaded video
2. Verify it loads from Supabase public URL (no OneDrive needed)
3. Check browser Network tab — should NOT call `video-download` endpoint

### Test 3: Legacy Video Playback
1. Find an existing video with only `onedrive_file_id` (no `storage_url`)
2. Verify it still plays via OneDrive fallback

### Test 4: Social Posting
1. Select a video with `storage_url`
2. Post to YouTube
3. Verify it uploads successfully without OneDrive token

### Test 5: No OneDrive Required
1. Log in as a user WITHOUT OneDrive connected
2. Upload a video — should work (Supabase Storage only)
3. Play the video — should work
4. Post to YouTube — should work (if YouTube connected)

### Test 6: Mobile PWA Upload
1. Open PWA on phone
2. Upload a video
3. Verify it goes to Supabase Storage

---

## Acceptance Criteria

### P0 — Core Flow
- [ ] `product-videos` Supabase Storage bucket exists and is public
- [ ] `product_videos` table has `storage_path`, `storage_url` columns
- [ ] `onedrive_file_id` and `onedrive_path` are nullable
- [ ] New video uploads go to Supabase Storage (not OneDrive)
- [ ] Video metadata saved with `storage_path` and `storage_url`
- [ ] Video playback works from Supabase URL
- [ ] Legacy videos still play via OneDrive fallback
- [ ] No OneDrive connection required for upload/playback

### P1 — Downstream Features
- [ ] Social posting reads from Supabase Storage (OneDrive fallback for legacy)
- [ ] YouTube posting reads from Supabase Storage
- [ ] Dubbing downloads from Supabase Storage
- [ ] Transcoding downloads from Supabase Storage
- [ ] All features still work for legacy OneDrive-only videos

### P2 — Cleanup
- [ ] `get-thumbnail.js` removed (or deprecated)
- [ ] `thumbnail-folder.js` removed (or deprecated)
- [ ] OneDrive shown as optional "Sync" feature in UI

### P3 — Optional Sync (Can be deferred)
- [ ] Background job copies new uploads to OneDrive (if connected)
- [ ] Sync status shown in UI
- [ ] Sync toggle in settings

---

## Files to Modify

| File | Priority |
|------|----------|
| UAT Supabase — SQL migrations | P0 |
| `netlify/functions/videos.js` | P0 |
| `netlify/functions/video-download.js` | P0 |
| `frontend/src/components/onedrive/VideoUploader.jsx` | P0 |
| `frontend/src/components/onedrive/VideoGallery.jsx` | P0 |
| `frontend/src/pages/PWAHome.jsx` | P0 |
| `netlify/functions/social-post-processor-background.js` | P1 |
| `netlify/functions/youtube-post.js` | P1 |
| `netlify/functions/youtube-scheduled-post.js` | P1 |
| `netlify/functions/meta-post.js` | P1 |
| `netlify/functions/social-post.js` | P1 |
| `netlify/functions/dub-onedrive-video.js` | P1 |
| `netlify/functions/video-variants.js` | P1 |
| `netlify/functions/check-dub-status.js` | P1 |
| `netlify/functions/video-transcode-background.js` | P1 |
| `netlify/functions/get-thumbnail.js` | P2 (remove) |
| `netlify/functions/thumbnail-folder.js` | P2 (remove) |
| `frontend/src/pages/Integrations.jsx` | P2 |
| NEW: `netlify/functions/onedrive-sync-background.js` | P3 |

---

## Output Required

1. Confirmation all SQL migrations ran successfully
2. Screenshot of `product-videos` bucket in Supabase Storage
3. Screenshot of video upload going to Supabase (not OneDrive)
4. Screenshot of video playback from Supabase URL
5. Verification that OneDrive connection is NOT required for upload
6. Screenshot of legacy video still playing via OneDrive fallback
7. List of all modified files with change descriptions
