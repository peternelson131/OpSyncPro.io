# Thumbnail Generation — In-Depth Technical Analysis

## System Overview

The thumbnail generation system composites a product image onto an owner's branded template and stores the result. It's designed to create YouTube-style thumbnails for Amazon Influencer video uploads.

---

## Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │         TRIGGER PATHS (3)            │
                    └─────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
    PATH 1: DB Trigger         PATH 2: Auto              PATH 3: Manual
    (task creation)            (owner assignment)         (does NOT exist)
         │                          │
         ▼                          ▼
   pg_net webhook              Frontend fire-and-forget
   POST generate-thumbnail     POST generate-thumbnail
   { taskId }                  { asin, ownerId }
         │                          │
         ▼                          ▼
   MODE 1: taskId              MODE 2: asin + ownerId
   - Look up task              - Find template by owner
   - Find owner via product    - Look up image from
   - Find template by owner      sourced_products
   - Look up image from        - Call generateThumbnail()
     sourced_products
   - Call generateThumbnail()
         │                          │
         └──────────┬───────────────┘
                    ▼
         ┌─────────────────────────────────────┐
         │     generateThumbnail() CORE         │
         │                                      │
         │  1. Fetch template from DB           │
         │  2. Download template from storage   │
         │  3. Find product image URL           │
         │     (passed in OR findProductImage)  │
         │  4. Download product image           │
         │  5. Sharp: resize template 1280x720  │
         │  6. Sharp: resize product to zone    │
         │  7. Sharp: composite product onto    │
         │     template at placement zone       │
         │  8. Upload JPEG to storage bucket    │
         │  9. Generate 24hr signed URL         │
         │ 10. Return { thumbnailUrl, path }    │
         └─────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    MODE 1 ONLY           MODE 2 ONLY
    Saves URL to          Returns URL to frontend
    influencer_tasks      ⚠️ NOTHING saves it to DB
    .image_url
```

---

## Files Involved

| File | Lines | Purpose |
|------|-------|---------|
| `netlify/functions/generate-thumbnail.js` | 132 | HTTP handler — routes to Mode 1 or Mode 2 |
| `netlify/functions/utils/thumbnail-generator.js` | 349 | Core logic: `generateThumbnail()` + `generateThumbnailForTask()` |
| `netlify/functions/get-thumbnail.js` | ~80 | Retrieves thumbnail URL for an ASIN (OneDrive lookup) |
| `netlify/functions/thumbnail-folder.js` | ~60 | Saves/retrieves user's OneDrive thumbnail folder preference |
| `netlify/functions/thumbnail-templates.js` | ~150 | CRUD for owner templates (upload, update zone, delete) |
| `frontend/src/pages/ProductCRM.jsx` | 2 call sites | Auto-triggers on owner assignment (fire-and-forget) |
| `supabase/migrations/20260122_thumbnail_templates.sql` | ~55 | Creates `thumbnail_templates` table + adds columns to `influencer_tasks` |
| `supabase/migrations/20260122_thumbnail_auto_generation_trigger.sql` | ~95 | DB trigger on `influencer_tasks` INSERT |

---

## Database Tables

### `thumbnail_templates`
```sql
CREATE TABLE thumbnail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  owner_id UUID REFERENCES crm_owners(id),       -- One template per owner
  template_storage_path TEXT NOT NULL,             -- Path in 'thumbnail-templates' bucket
  placement_zone JSONB NOT NULL,                   -- { x, y, width, height } as percentages (0-100)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, owner_id)
);
```

**Current data (prod):**
| Owner | Template Path | Placement Zone |
|-------|--------------|----------------|
| Peter | `94e1f3a0.../Peter.jpg` | x:15.6, y:51.6, w:26.9, h:39.3 |
| Jaimie | `94e1f3a0.../Jaimie.jpg` | x:15, y:51.4, w:28.1, h:40.2 |

### `product_videos`
```sql
-- Contains:
thumbnail_url TEXT  -- Where the generated thumbnail URL is stored
```

### `influencer_tasks`
```sql
-- Contains (added by migration):
thumbnail_url TEXT  -- Mode 1 saves here
image_url TEXT      -- Mode 1 also saves here (dual-write)
```

### `app_config`
```sql
-- Runtime config for DB trigger:
thumbnail_webhook_url = 'https://opsyncpro.io/.netlify/functions/generate-thumbnail'
webhook_secret = 'acf-internal-543dbab2865e353ccf5c07ab202e74b5'
```

---

## Storage Buckets (Supabase Storage)

| Bucket | Purpose | Contents |
|--------|---------|----------|
| `thumbnail-templates` | Owner base templates | JPEG images (e.g., Peter.jpg, Jaimie.jpg) |
| `generated-thumbnails` | Composited output | JPEG files: `{userId}/{asin}_{timestamp}.jpg` |

---

## Trigger Path Details

### PATH 1: Database Trigger (on task creation)

**Trigger:** `influencer_tasks_auto_thumbnail` fires AFTER INSERT on `influencer_tasks`

**Flow:**
```
1. New influencer_task inserted
2. DB trigger function runs:
   - Checks: asin IS NOT NULL AND status = 'pending'
   - Reads webhook_url from app_config table
   - Calls pg_net.http_post() → POST /generate-thumbnail { taskId }
3. generate-thumbnail.js receives taskId (Mode 1)
4. generateThumbnailForTask():
   a. Fetch task → get asin, video_id
   b. Look up sourced_products by asin → get product.id, image_url
   c. Look up product_owners by product.id WHERE is_primary = true → get owner_id
   d. Look up thumbnail_templates by owner_id → get template
   e. Call generateThumbnail({ templateId, asin, userId, productImageUrl })
   f. On success → UPDATE influencer_tasks SET image_url = thumbnailUrl
```

**Known failures:**
- ⚠️ Owner usually NOT assigned at task creation time → Step (c) fails → "No owner found"
- ⚠️ Migration SQL checks `NEW.thumbnail_url IS NULL` but `thumbnail_url` column doesn't exist on prod (column was added to migration file but never applied)
- ⚠️ Webhook auth uses `X-Webhook-Secret` header — must match `WEBHOOK_SECRET` env var exactly

### PATH 2: Frontend Auto-Trigger (on owner assignment)

**Trigger:** Two locations in `ProductCRM.jsx`

**Location 1 — Bulk edit (line 2450-2455):**
```javascript
// When bulk assigning owners via modal
if ((changes.ownerAction === 'set' || changes.ownerAction === 'add') && changes.ownerIds?.length > 0) {
  generateThumbnailsForProducts(productIds, changes.ownerIds).catch(err => {
    console.error('Background thumbnail generation error:', err);
  });
}
```

**Location 2 — Single product owner update (line 2651-2654):**
```javascript
// When adding owners to a single product in detail panel
if (newOwners.length > 0) {
  const ownerIds = newOwners.map(o => o.owner_id);
  generateThumbnailsForProducts([productId], ownerIds);
}
```

**`generateThumbnailsForProducts()` function (line 2468):**
```javascript
const generateThumbnailsForProducts = async (productIds, ownerIds) => {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return;  // ⚠️ Silent failure if no session
  
  // Look up ASINs from in-memory products array
  const productAsins = products
    .filter(p => productIds.includes(p.id))
    .reduce((map, p) => { map[p.id] = p.asin; return map; }, {});
  
  // Loop: for each product × each owner → call generate-thumbnail
  for (const productId of productIds) {
    const asin = productAsins[productId];
    if (!asin) continue;  // ⚠️ Silent skip
    for (const ownerId of ownerIds) {
      const response = await fetch('/.netlify/functions/generate-thumbnail', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin, ownerId })
      });
      const result = await response.json();
      // ⚠️ Only logs to console — no user feedback
      // ⚠️ Does NOT save thumbnailUrl to any database table
    }
  }
};
```

**Known failures:**
- ⚠️ Returns `thumbnailUrl` but **nothing saves it to the database** — URL is logged to console and discarded
- ⚠️ Fire-and-forget with `console.error` only — user has no idea if it worked or failed
- ⚠️ `findProductImageUrl(asin)` fallback uses ASIN as image code (wrong — Amazon image codes ≠ ASINs). Only works if `sourced_products.image_url` exists.
- ⚠️ Sequential processing — 10 products × 2 owners = 20 sequential API calls

### PATH 3: Manual Button (DOES NOT EXIST YET)

No manual trigger exists. There is no "Generate Thumbnail" button anywhere in the UI.

---

## Core Generation Logic

### `generateThumbnail()` — Step-by-Step

```
Input: { templateId, asin, userId, productImageUrl? }

Step 1: Fetch template record from thumbnail_templates
        → Gets: template_storage_path, placement_zone
        ❌ Can fail: template not found

Step 2: Download template image from Supabase Storage bucket "thumbnail-templates"
        → Gets: Buffer of template JPEG
        ❌ Can fail: storage download error, file missing

Step 3: Find product image URL
        → Uses productImageUrl if provided
        → Falls back to findProductImageUrl(asin) which tries:
           - https://m.media-amazon.com/images/I/{ASIN}._SL1000_.jpg
           - https://images-na.ssl-images-amazon.com/images/I/{ASIN}._SL1000_.jpg
           - https://m.media-amazon.com/images/I/{ASIN}.jpg
        ⚠️ These URLs will NEVER work — Amazon image codes are NOT ASINs
        ❌ Can fail: no image found (if sourced_products.image_url is null)

Step 4: Download product image from Amazon URL
        → Gets: Buffer of product image
        ❌ Can fail: Amazon returns 403, image URL expired, timeout

Step 5: Resize template to 1280×720 (Sharp)
        → fit: 'cover', position: 'center'

Step 6: Calculate placement zone (percentages → pixels)
        → Example: { x:15.6%, y:51.6%, w:26.9%, h:39.3% }
        → Pixels:  { left:200, top:372, width:344, height:283 }

Step 7: Resize product image to fit zone
        → fit: 'contain' with transparent background
        → Maintains aspect ratio

Step 8: Composite product onto template (Sharp)
        → Product overlaid at calculated position
        → Output: JPEG quality 85

Step 9: Upload to Supabase Storage bucket "generated-thumbnails"
        → Path: {userId}/{asin}_{timestamp}.jpg
        → upsert: false (won't overwrite — creates duplicates!)
        ❌ Can fail: storage quota, permission error

Step 10: Generate signed URL (24-hour expiry)
         → Returns temporary URL
         ⚠️ URL expires after 24 hours — thumbnails become broken links
```

### `findProductImageUrl()` — The Broken Fallback

```javascript
// This function tries to construct Amazon image URLs using the ASIN
// This DOES NOT work because Amazon image codes are NOT ASINs
// Example: ASIN B07M9G7S2T → Amazon image code might be "71sK3fL2jTL"
// The function would try: /images/I/B07M9G7S2T._SL1000_.jpg → 404
async function findProductImageUrl(asin) {
  const patterns = [
    `https://m.media-amazon.com/images/I/${asin}._SL1000_.jpg`,   // ❌ Never works
    `https://images-na.ssl-images-amazon.com/images/I/${asin}._SL1000_.jpg`, // ❌ Never works
    `https://m.media-amazon.com/images/I/${asin}.jpg`,             // ❌ Never works
  ];
  // ... tries HEAD request on each, all return 404
  return null; // Always returns null
}
```

---

## Failure Analysis Summary

| # | Failure | Path Affected | Impact | Root Cause |
|---|---------|--------------|--------|------------|
| 1 | Owner not assigned at task creation | Path 1 (DB trigger) | Trigger fires but fails "No owner found" | Tasks created before owner is assigned |
| 2 | thumbnail_url column missing on prod | Path 1 (DB trigger) | Trigger condition checks non-existent column | Migration file exists but was never applied |
| 3 | Mode 2 doesn't save URL to DB | Path 2 (auto) | Thumbnail generated but URL is discarded | Frontend only logs result to console |
| 4 | `findProductImageUrl` uses ASIN as image code | Both paths | Falls back to broken URLs → "Product image not found" | Amazon image codes ≠ ASINs |
| 5 | Signed URLs expire in 24h | Both paths | Thumbnails become broken links after 1 day | Using `createSignedUrl(86400)` instead of public URLs |
| 6 | Silent fire-and-forget | Path 2 (auto) | User has no idea if generation succeeded or failed | `catch(err => console.error(...))` |
| 7 | No duplicate prevention | Both paths | Multiple thumbnails generated for same product | `upsert: false` creates new file each time |
| 8 | Sequential API calls | Path 2 (auto) | Slow for bulk operations (N products × M owners) | Synchronous loop |

---

## What Works vs What's Broken

### ✅ Working
- Template upload and zone configuration (CRUD via `thumbnail-templates.js`)
- Core compositing logic (Sharp resize + overlay)
- Image download from valid URLs
- Storage upload
- Template lookup by owner

### ❌ Broken
- **Path 1 (DB trigger):** Fires at wrong time (before owner assigned), checks non-existent column
- **Path 2 (auto on owner assignment):** Generates thumbnail but doesn't save URL anywhere
- **Image fallback:** `findProductImageUrl()` never finds images — fundamentally broken
- **URL persistence:** 24h signed URLs expire, making thumbnails temporary
- **User feedback:** Zero — no indication of success or failure

### ⚠️ Partially Working
- **Mode 2 backend (`generate-thumbnail.js`):** Works correctly IF called with valid asin + ownerId AND the product has an `image_url` in `sourced_products`. The backend logic is sound — it's the triggering and result-saving that's broken.

---

## Simplification Recommendation

### Remove
1. DB trigger (`influencer_tasks_auto_thumbnail`) — fires at wrong time
2. Auto-fire in `ProductCRM.jsx` bulk edit handler (line 2453)
3. Auto-fire in `ProductCRM.jsx` single owner update (line 2654)
4. `findProductImageUrl()` function — fundamentally broken, never works
5. `get-thumbnail.js` — OneDrive-based lookup, not used in current flow

### Add
1. **"Generate Thumbnail" button** in product detail panel
   - Only enabled when product has: image_url AND at least one owner with a template
   - Shows loading spinner during generation
   - Shows success/error toast
2. **Save URL to `product_videos.thumbnail_url`** on success
3. **Use public URLs** instead of 24h signed URLs (or use `getPublicUrl()`)

### Keep
1. `generate-thumbnail.js` (Mode 2 handler — works correctly)
2. `thumbnail-generator.js` core `generateThumbnail()` function (compositing logic is solid)
3. `thumbnail-templates.js` (template CRUD — works correctly)
4. `thumbnail-folder.js` (OneDrive folder config — may be useful later)
5. `thumbnail_templates` table and storage buckets

### Result
- **Before:** 3 trigger paths, 5+ failure points, zero user feedback
- **After:** 1 trigger path (manual button), clear success/failure feedback, URL persisted to DB
