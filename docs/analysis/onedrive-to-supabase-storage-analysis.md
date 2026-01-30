# OneDrive Integration Refactor — Analysis

## Executive Summary

OneDrive is currently the **primary storage** for all videos. Every downstream feature (social posting, dubbing, YouTube upload, transcoding) must download from OneDrive via Microsoft Graph API, adding latency, auth complexity, and a single point of failure. The proposal is to flip this: **Supabase Storage becomes primary**, and OneDrive becomes an optional "dump to folder" sync for users who want local copies.

---

## Problem Statement

### Why now?

1. **OneDrive is tightly coupled everywhere** — 22 backend functions reference OneDrive. Every video operation starts with "download from OneDrive" which requires a valid OAuth token.
2. **OAuth token management is fragile** — tokens expire hourly, refresh tokens can be revoked, and if the token refresh fails silently, all video features break.
3. **Double-download pattern** — Social posting already transcodes and stores in Supabase (`transcoded-videos` bucket). So videos get downloaded from OneDrive → transcoded → re-uploaded to Supabase. Why not start in Supabase?
4. **User onboarding friction** — New users must connect OneDrive before they can upload a single video. This is a hard prerequisite for the core workflow.
5. **The system is too complex** — 22 functions, OAuth PKCE flow, encrypted tokens, folder management, upload sessions, Graph API calls — all to store/retrieve files.

---

## Current State: OneDrive as Primary Storage

### How it works today

```
User uploads video
    → Frontend creates OneDrive upload session (resumable)
    → File chunks uploaded directly to OneDrive via Microsoft Graph
    → product_videos record created with onedrive_file_id + onedrive_path
    → File lives ONLY in OneDrive

Every downstream operation:
    → Fetch user's encrypted OAuth token from DB
    → Decrypt token → check expiry → refresh if needed
    → Download file from OneDrive via Graph API
    → Process (transcode, dub, post)
    → Sometimes re-upload result to OneDrive (dubbed videos)
```

### Current data model (`product_videos`)

```sql
CREATE TABLE product_videos (
  id UUID PRIMARY KEY,
  user_id UUID,
  product_id UUID,
  onedrive_file_id TEXT NOT NULL,     -- ← OneDrive is REQUIRED
  onedrive_path TEXT NOT NULL,         -- ← OneDrive is REQUIRED
  filename TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  upload_status TEXT DEFAULT 'complete',
  -- Added later for social posting:
  social_ready_url TEXT,               -- Supabase Storage URL (already exists!)
  social_ready_status TEXT,
  social_ready_at TIMESTAMPTZ,
  social_ready_error TEXT
);
```

Note: `social_ready_url` already stores a Supabase public URL for transcoded videos. This is the pattern we'd expand.

### Functions that depend on OneDrive

| Function | What it does with OneDrive | Difficulty to migrate |
|----------|---------------------------|----------------------|
| `onedrive-auth-start.js` | OAuth initiation | Keep (optional connection) |
| `onedrive-callback.js` | OAuth token exchange | Keep (optional connection) |
| `onedrive-disconnect.js` | Remove connection | Keep |
| `onedrive-status.js` | Check connection status | Keep |
| `onedrive-folders.js` | Browse folders | Keep (for sync feature) |
| `onedrive-set-folder.js` | Set default folder | Keep (for sync feature) |
| `onedrive-upload-session.js` | Create resumable upload | **Rewrite**: upload to Supabase instead |
| `videos.js` | Video CRUD + metadata | **Modify**: remove OneDrive requirement |
| `video-download.js` | Get download URL | **Rewrite**: serve from Supabase Storage |
| `video-transcode-background.js` | Download → transcode → Supabase | **Simplify**: already in Supabase, skip OneDrive download |
| `social-post-processor-background.js` | Download video for posting | **Simplify**: read from Supabase |
| `social-post.js` | Initiate social posting | **Simplify**: read from Supabase |
| `youtube-post.js` | Upload to YouTube | **Simplify**: read from Supabase |
| `youtube-scheduled-post.js` | Scheduled YouTube uploads | **Simplify**: read from Supabase |
| `meta-post.js` | Post to Facebook/Instagram | **Simplify**: read from Supabase |
| `dub-onedrive-video.js` | Download → dub → save back | **Rewrite**: download from Supabase |
| `check-dub-status.js` | Check dubbing progress | Minor: update save location |
| `video-variants.js` | Manage dubbed versions | **Modify**: storage references |
| `get-thumbnail.js` | Get thumbnail from OneDrive | **Remove**: thumbnails now in Supabase |
| `thumbnail-folder.js` | OneDrive thumbnail folder | **Remove** |
| `influencer-tasks.js` | Task creation | Minor: update video references |
| `utils/onedrive-api.js` | Graph API wrapper | Keep (for optional sync) |
| `utils/onedrive-encryption.js` | Token encryption | Keep (for optional sync) |

---

## Proposed Approaches

### Option A: Supabase Primary + OneDrive Optional Sync (Recommended)

**Description:** Upload videos directly to Supabase Storage. If user has OneDrive connected and enabled, asynchronously copy to their designated OneDrive folder as a background job.

**Architecture:**
```
User uploads video
    → File uploaded to Supabase Storage bucket "product-videos"
    → product_videos record with storage_path + public URL
    → File available immediately (no auth needed to read)
    
    [Optional] If OneDrive connected:
    → Background job copies file to OneDrive folder
    → Updates product_videos.onedrive_file_id (for reference only)

Every downstream operation:
    → Read directly from Supabase Storage (public URL or signed URL)
    → No OAuth, no token refresh, no Graph API
```

**New data model:**
```sql
ALTER TABLE product_videos 
  ALTER COLUMN onedrive_file_id DROP NOT NULL,
  ALTER COLUMN onedrive_path DROP NOT NULL,
  ADD COLUMN storage_path TEXT,           -- Supabase Storage path
  ADD COLUMN storage_url TEXT,            -- Public/signed URL
  ADD COLUMN onedrive_sync_status TEXT;   -- 'pending', 'synced', 'disabled', 'failed'
```

**Pros:**
- Dramatically simpler — no OAuth needed for core workflow
- Videos available instantly (no auth token dance)
- No token expiry issues breaking features
- New users can upload immediately (no OneDrive setup required)
- Downstream functions simplified (read from storage URL vs Graph API)
- OneDrive still available for users who want it

**Cons:**
- Supabase Storage costs (see cost analysis below)
- Migration of existing videos (need to copy from OneDrive → Supabase)
- Upload size limits (Supabase free tier: 50MB per file, Pro: 5GB)
- 16 functions need modification

**Effort:** Large (L) — 2-3 days of focused work
**Risk:** Medium — Migration of existing data is the main risk

---

### Option B: Keep OneDrive Primary, Fix Token Issues

**Description:** Keep current architecture but fix the reliability issues — better token refresh, error handling, retry logic.

**Architecture:** Same as today, but with better error handling.

**Pros:**
- Minimal code changes
- No migration needed
- No storage cost change

**Cons:**
- Still requires OneDrive connection for basic features
- Still 22 functions with OneDrive dependency
- Token refresh issues are fundamental to OAuth — fixing them is whack-a-mole
- User onboarding friction remains
- System complexity unchanged

**Effort:** Small (S) — 1 day
**Risk:** Low, but doesn't solve the core problem

---

### Option C: Supabase Primary, No OneDrive at All

**Description:** Remove OneDrive integration entirely. All files in Supabase Storage.

**Pros:**
- Maximum simplification — remove 8 OneDrive-specific functions
- No OAuth code at all
- Cleanest architecture

**Cons:**
- Loses OneDrive sync for users who want local copies
- More aggressive migration
- No going back easily

**Effort:** Large (L) — 2-3 days
**Risk:** Medium — burning a bridge that might be wanted later

---

## Cost Analysis: Supabase Storage

### Current Supabase Plan (Pro — $25/month)
- Storage: 100GB included
- Bandwidth: 250GB included
- Max file size: 5GB

### Estimated Usage
| Item | Estimate |
|------|----------|
| Average video size | 50-200MB |
| Videos per month | 50-100 |
| Monthly storage growth | 5-10GB |
| Time to hit 100GB | 10-20 months |
| Video downloads/month | ~500 (social posts, previews) |
| Monthly bandwidth | ~50GB |

**Conclusion:** Fits within Pro plan for at least the first year. After 100GB, additional storage is $0.021/GB.

### Storage Optimization
- Set retention policy: delete original after OneDrive sync (if enabled)
- Compress/transcode on upload (already doing this for social)
- Clean up old/unused videos periodically

---

## Migration Path (Option A)

### Phase 1: New uploads go to Supabase (Week 1)
1. Create `product-videos` storage bucket in Supabase
2. Modify upload flow: frontend uploads to Supabase Storage
3. Update `product_videos` schema (add `storage_path`, `storage_url`)
4. New videos get Supabase URL as primary, OneDrive sync as optional background job
5. Update `video-download.js` to serve from Supabase if `storage_url` exists, fallback to OneDrive

### Phase 2: Update downstream consumers (Week 1-2)
6. Update social posting to prefer `storage_url` over OneDrive download
7. Update YouTube posting similarly
8. Update dubbing to download from Supabase
9. Update transcoding (already partially done — `social_ready_url`)
10. Update video gallery/player to use Supabase URLs

### Phase 3: OneDrive sync feature (Week 2)
11. Create background job: after upload, copy to OneDrive folder if connected
12. Add sync status indicator in UI
13. OneDrive connection becomes "Settings → Sync" feature, not a prerequisite

### Phase 4: Migrate existing videos (Week 2-3)
14. Background job: for each existing `product_videos` with `onedrive_file_id`:
    - Download from OneDrive
    - Upload to Supabase Storage
    - Update `storage_path` and `storage_url`
15. This can run gradually — existing features still work via OneDrive during migration

### Phase 5: Cleanup (Week 3)
16. Remove OneDrive as a hard requirement from any flow
17. Simplify all downstream functions to read from Supabase only
18. Mark OneDrive-only functions as "sync feature only"

---

## Technical Considerations

### Upload Flow Change

**Today (OneDrive resumable upload):**
```
Frontend → onedrive-upload-session → Microsoft Graph (resumable)
    → Client uploads chunks directly to OneDrive
    → On complete: save metadata to product_videos
```

**Proposed (Supabase Storage):**
```
Frontend → Supabase Storage upload (direct, using supabase-js)
    → On complete: save metadata to product_videos
    → [Optional background]: copy to OneDrive
```

Supabase JS SDK supports large file uploads with automatic chunking. For very large files (>50MB on free, >5GB on Pro), resumable uploads are supported via `tus` protocol.

### Video Playback

**Today:** Frontend calls `video-download.js` → function fetches OneDrive download URL → returns temporary URL → video player loads from OneDrive CDN.

**Proposed:** Frontend uses Supabase Storage public URL directly. No backend call needed. Videos load faster (no auth round-trip).

### Social Posting

**Today:** Download from OneDrive → (optionally transcode) → upload to YouTube/Facebook/Instagram.

**Proposed:** Read from Supabase Storage → upload to platform. Skip the OneDrive download entirely. The `social_ready_url` pattern already does this for transcoded videos.

### Dubbing

**Today:** Download from OneDrive → send to ElevenLabs → download result → upload back to OneDrive.

**Proposed:** Download from Supabase → send to ElevenLabs → download result → upload to Supabase. Same flow, different storage backend. Simpler auth.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Supabase Storage outage | Low | High | Videos in OneDrive as backup (if synced) |
| Upload size limits | Low | Medium | Pro plan supports 5GB; videos rarely exceed 500MB |
| Migration fails mid-way | Medium | Low | Dual-read: try Supabase first, fallback to OneDrive |
| Storage costs escalate | Low | Low | 100GB included; $0.021/GB after; set retention policies |
| OneDrive sync job fails | Medium | Low | Non-critical — sync is optional, videos work without it |
| Breaking existing videos | Medium | Medium | Migration copies, doesn't delete; keep OneDrive fallback |

---

## Open Questions

1. **Do you want to keep OneDrive sync at all?** Or is it okay to remove it entirely (Option C)? If you never actually use the OneDrive copies, we can skip the sync feature.

2. **Existing videos** — How many videos are currently in OneDrive? This affects migration time. Do you want to migrate them all, or just let new ones go to Supabase and leave old ones where they are?

3. **PWA upload** — The mobile PWA (`PWAHome.jsx`) also uploads to OneDrive. Should it also upload to Supabase Storage instead?

4. **Video quality** — Do you want to transcode/compress on upload (saves storage) or keep originals (maximum quality)?

---

## Recommendation

**Option A: Supabase Primary + OneDrive Optional Sync**

This gives you:
- ✅ **Simpler system** — no OAuth required for core workflow
- ✅ **Faster video access** — direct Supabase URLs, no auth dance
- ✅ **No onboarding friction** — new users upload immediately
- ✅ **OneDrive still available** — optional sync for local copies
- ✅ **Existing infrastructure** — already using Supabase Storage for thumbnails and transcoded videos
- ✅ **Gradual migration** — can run both systems in parallel during transition

The fact that `social_ready_url` (Supabase Storage) already exists in the schema proves this pattern works. We're just making it the default instead of the exception.

---

## Next Steps (if approved)

1. Answer the open questions above
2. `/plan` — Break down into tasks with acceptance criteria
3. `/implement` — Execute in phases (new uploads first, then migration)
4. `/confirm` — Verify each phase works before proceeding

---

*Analysis created: 2026-01-30*
*Status: Draft — Awaiting Decision*
