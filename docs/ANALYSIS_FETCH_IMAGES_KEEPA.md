# Analysis: "Fetch Images from Keepa" Feature

**Date:** January 29, 2026  
**Analyst:** Backend Agent  
**Project:** eBay Price Reducer - Catalog Import

---

## Executive Summary

The "Fetch Images from Keepa" feature allows users to bulk-fetch product images for imported ASINs that are missing images. It integrates with the Keepa Product Data API to retrieve image codes and constructs Amazon CDN URLs.

**⚠️ CRITICAL BUG FOUND:** The backend code references an undefined function `keepaFetch()` on line 423 of `catalog-import.js`, which will cause runtime errors when the feature is used.

**Status:** Partially implemented with critical bug  
**Keepa API:** `/product` endpoint, domain 1 (US), batch processing (100 ASINs/batch)  
**Data Storage:** `catalog_imports.image_url` column (TEXT)  
**Rate Limiting:** Keepa tokens consumed per batch request

---

## 1. Frontend: User Interface & Button

### Location
**File:** `frontend/src/pages/CatalogImport.jsx`

### Button Implementation
**Lines 783-799:**
```jsx
<button
  onClick={() => handleFetchImages(true)}
  disabled={fetchingImages}
  className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
>
  {fetchingImages ? (
    <Loader className="w-4 h-4 animate-spin" />
  ) : (
    <RefreshCw className="w-4 h-4" />
  )}
  {fetchingImages ? `Fetching... ${imageFetchProgress?.elapsed || 0}s` : 'Fetch Images from Keepa'}
</button>
```

### Handler Function
**Lines 544-581:** `handleFetchImages(showModal = true)`

**Behavior:**
1. Sets loading state: `setFetchingImages(true)`
2. Starts timer for elapsed time tracking
3. Shows progress modal if `showModal === true`
4. Makes POST request to `/.netlify/functions/catalog-import`
5. Polls/updates elapsed time every 1 second during fetch
6. On completion, displays results modal with:
   - Number of images updated
   - Number of ASINs with no image available
   - Number of batches processed
   - Keepa tokens consumed
   - Total elapsed time
7. Reloads catalog list to show updated images

### API Request Payload
```javascript
{
  action: 'fetch_images',
  limit: 100  // Max ASINs per batch
}
```

### State Management
- `fetchingImages` (boolean) - Loading state
- `imageFetchProgress` (object) - Progress/result data
  - `message` (string) - Status message
  - `inProgress` (boolean) - Whether still fetching
  - `elapsed` (number) - Elapsed seconds
  - `updated` (number) - ASINs updated
  - `noImageAvailable` (number) - ASINs without images
  - `batches` (number) - Batches processed
  - `tokensUsed` (number) - Keepa tokens consumed
  - `error` (boolean) - Whether error occurred
- `imageFetchStartTime` (timestamp) - Start time for elapsed calculation

### Auto-Fetch on Import
**Lines 652-656:**
Users can enable "Fetch images from Keepa after import" checkbox, which automatically triggers `handleFetchImages(true)` after successful catalog import.

---

## 2. Backend: Netlify Function Handler

### Location
**File:** `netlify/functions/catalog-import.js`

### Action Handler Entry Point
**Lines 296-429:** `handlePost()` → `body.action === 'fetch_images'`

### Step-by-Step Flow

#### Step 1: Validate Keepa API Key
**Lines 297-301:**
```javascript
const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
if (!KEEPA_API_KEY) {
  return errorResponse(500, 'KEEPA_API_KEY not configured', headers);
}
```

#### Step 2: Query ASINs Missing Images
**Lines 304-312:**
```javascript
const { data: missingImages, error: fetchError } = await getSupabase()
  .from('catalog_imports')
  .select('id, asin')
  .eq('user_id', userId)
  .or('image_url.is.null,image_url.eq.,image_url.eq.null');
```

**Query Logic:**
- Filters by current user
- Finds records where `image_url` is:
  - NULL (database null)
  - Empty string (`''`)
  - String literal `'null'`

**Early Exit:**
If no missing images found, returns success response immediately.

#### Step 3: Batch Processing Loop
**Lines 330-426:**
```javascript
const BATCH_SIZE = 100;
let totalUpdated = 0;
let totalTokens = 0;
let noImageAvailable = 0;

for (let i = 0; i < missingImages.length; i += BATCH_SIZE) {
  const batch = missingImages.slice(i, i + BATCH_SIZE);
  const asins = batch.map(r => r.asin);
  // ... process batch
}
```

**Batch Parameters:**
- **Batch size:** 100 ASINs (Keepa API limit)
- **Parallel processing:** None (sequential batches)
- **Progress logging:** Console logs for each batch

---

## 3. Keepa API Integration

### API Endpoint
```
https://api.keepa.com/product?key={KEEPA_API_KEY}&domain=1&asin={ASIN1,ASIN2,...}
```

**Parameters:**
- `key` - Keepa API key (from environment variable)
- `domain` - `1` (Amazon US marketplace)
- `asin` - Comma-separated list of ASINs (max 100)

### ⚠️ CRITICAL BUG: Undefined Function
**Line 423:**
```javascript
const keepaData = await keepaFetch(keepaUrl);
```

**Problem:** `keepaFetch()` function is **NOT DEFINED** anywhere in the codebase.

**Expected Behavior:** Should make HTTPS GET request with gzip decompression support.

**Similar Implementation Found:**
- `netlify/functions/keepa-api.js` has `httpsGet()` function (lines 13-79)
- `netlify/functions/keepa-fetch-product.js` uses `node-fetch` directly

**Recommended Fix:**
```javascript
// Option 1: Use node-fetch (already in dependencies)
const fetch = require('node-fetch');
const keepaResponse = await fetch(keepaUrl);
const keepaData = await keepaResponse.json();

// Option 2: Import httpsGet from keepa-api.js
const { httpsGet } = require('./keepa-api');
const keepaData = await httpsGet(keepaUrl);
```

### Response Format
**Expected structure:**
```javascript
{
  products: [
    {
      asin: "B01N9SPQHQ",
      imagesCSV: "51GxQhfGhQL,41ABC123XY,31DEF456ZW"
      // ... other product data
    }
  ],
  tokensConsumed: 1
}
```

### Image Extraction Logic
**Lines 377-394:**

1. **Parse imagesCSV field:**
   ```javascript
   const imageCodes = product.imagesCSV.split(',');
   const imageCode = imageCodes[0]?.trim(); // Get first (primary) image
   ```

2. **Construct Amazon CDN URL:**
   ```javascript
   const imageUrl = `https://m.media-amazon.com/images/I/${imageCode}._SL500_.jpg`;
   ```
   
   **URL Format:**
   - Base: `https://m.media-amazon.com/images/I/`
   - Image code: e.g., `51GxQhfGhQL`
   - Size modifier: `._SL500_` (500px max dimension)
   - Extension: `.jpg`

3. **Handle missing images:**
   - Empty `imagesCSV`: Count as `noImageAvailable`
   - ASIN not in Keepa response: Count as `noImageAvailable`
   - Empty image code: Count as `noImageAvailable`

### Rate Limiting
**Keepa Token Consumption:**
- 1 token per API request (regardless of ASIN count)
- Tracked via `tokensConsumed` field in response
- Accumulated across batches: `totalTokens += keepaData.tokensConsumed`

---

## 4. Data Flow & Storage

### Database Table: `catalog_imports`
**Schema:** (from `migrations/create-catalog-imports-table.sql`)

```sql
CREATE TABLE catalog_imports (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  asin TEXT NOT NULL,
  title TEXT,
  image_url TEXT,  -- ← Updated by fetch_images
  category TEXT,
  price DECIMAL(10, 2),
  status TEXT DEFAULT 'pending',
  correlation_count INTEGER DEFAULT 0,
  correlations JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT unique_user_catalog_asin UNIQUE (user_id, asin)
);
```

### Update Operation
**Lines 402-415:**
```javascript
for (const row of batch) {
  const imageUrl = imageMap[row.asin];
  if (imageUrl) {
    const { error: updateError } = await getSupabase()
      .from('catalog_imports')
      .update({ image_url: imageUrl })
      .eq('id', row.id);
    
    if (!updateError) {
      totalUpdated++;
      batchUpdated++;
    }
  }
}
```

**Update Strategy:**
- Individual updates per ASIN (not bulk update)
- Updates only if image URL found in Keepa response
- Tracks success/failure per ASIN

### UI Display
**File:** `frontend/src/pages/CatalogImport.jsx`, Lines 885-895

```jsx
{item.image_url ? (
  <img 
    src={item.image_url} 
    alt={item.title || item.asin}
    className="w-12 h-12 object-contain bg-white rounded"
  />
) : (
  <div className="w-12 h-12 bg-theme-primary rounded flex items-center justify-center">
    <Package className="w-6 h-6 text-theme-tertiary" />
  </div>
)}
```

**Display Logic:**
- If `image_url` exists: Show `<img>` with 12x12 thumbnail
- If `image_url` is null/empty: Show placeholder icon (Package)

---

## 5. Error Handling & Edge Cases

### 1. Keepa API Key Missing
**Lines 297-301:**
- Returns 500 error: "KEEPA_API_KEY not configured"
- Blocks feature entirely if env var not set

### 2. No ASINs Need Images
**Lines 319-325:**
- Early return with success message
- No API calls made
- Response: `{ success: true, message: 'All items already have images', updated: 0 }`

### 3. Keepa API Error
**Lines 427-430:**
```javascript
} catch (keepaError) {
  console.error(`Batch ${batchNum} error:`, keepaError.message || keepaError);
  // Continue with next batch
}
```

**Behavior:**
- Logs error but **continues** processing remaining batches
- Partial success scenario: Some batches succeed, others fail
- No retry logic

### 4. Missing Image Data from Keepa
**Three scenarios tracked:**

**a) Empty imagesCSV field:**
```javascript
} else {
  noImageAvailable++;
  console.log(`  ⚠️ ${product.asin}: No imagesCSV (Keepa has no image data)`);
}
```

**b) ASIN not in Keepa response:**
```javascript
for (const asin of asins) {
  if (!productMap.has(asin)) {
    noImageAvailable++;
    console.log(`  ⚠️ ${asin}: Not found in Keepa`);
  }
}
```

**c) Empty image code:**
```javascript
if (imageCode && imageCode.length > 0) {
  // ... construct URL
} else {
  noImageAvailable++;
  console.log(`  ⚠️ ${product.asin}: Empty image code`);
}
```

### 5. Database Update Failures
**Lines 411-413:**
```javascript
if (!updateError) {
  totalUpdated++;
  batchUpdated++;
} else {
  console.error(`  ❌ Failed to update ${row.asin}:`, updateError.message);
}
```

**Behavior:**
- Individual update failures logged but don't stop batch
- `totalUpdated` only increments on success
- No rollback mechanism

### 6. Re-fetch Behavior
**Current implementation:**
- Re-running fetch will query same ASINs (those with null/empty image_url)
- Successfully fetched images won't be re-fetched
- Failed ASINs can be retried by running fetch again

---

## 6. Code References

### Frontend (CatalogImport.jsx)
| Component | Lines | Description |
|-----------|-------|-------------|
| Button | 783-799 | Orange "Fetch Images from Keepa" button |
| Handler | 544-581 | `handleFetchImages()` - API call & state management |
| Progress Modal | 768-808 | Loading/completion modal with elapsed timer |
| Auto-fetch Checkbox | 734-741 | Option to auto-fetch after import |
| Image Display | 885-895 | Thumbnail rendering in catalog list |
| State Declarations | 66-71 | `fetchingImages`, `imageFetchProgress`, `imageFetchStartTime` |

### Backend (catalog-import.js)
| Component | Lines | Description |
|-----------|-------|-------------|
| Action Handler | 296-429 | `fetch_images` action in `handlePost()` |
| API Key Check | 297-301 | Validate KEEPA_API_KEY env var |
| Query Missing Images | 304-312 | Supabase query for null/empty image_url |
| Batch Loop | 330-426 | Process 100 ASINs at a time |
| Keepa API Call | 422-423 | ⚠️ **BUG**: Undefined `keepaFetch()` |
| Image Extraction | 377-394 | Parse imagesCSV, construct CDN URLs |
| Database Update | 402-415 | Individual updates per ASIN |
| Response | 433-442 | Return stats (updated, noImageAvailable, batches, tokens) |

### Database Schema
| File | Description |
|------|-------------|
| `migrations/create-catalog-imports-table.sql` | Table definition with `image_url TEXT` column |

### Related Keepa Files
| File | Lines | Description |
|------|-------|-------------|
| `keepa-api.js` | 13-79 | `httpsGet()` - Working gzip-aware HTTPS helper |
| `keepa-fetch-product.js` | 140-150 | Uses `node-fetch` for Keepa API calls |

---

## 7. Issues & Improvement Opportunities

### 🔴 Critical Issues

#### 1. Undefined Function Bug
**Location:** `catalog-import.js:423`  
**Problem:** `keepaFetch()` is called but never defined  
**Impact:** Feature will crash with "keepaFetch is not defined" error  
**Fix Priority:** IMMEDIATE

**Recommended Fix:**
```javascript
// Add at top of file
const https = require('https');
const zlib = require('zlib');

// Add helper function before handlePost
async function keepaFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'User-Agent': 'eBay-Price-Reducer/1.0'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Keepa API returned ${res.statusCode}`));
        return;
      }
      
      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      }
      
      let data = '';
      stream.on('data', chunk => data += chunk);
      stream.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}
```

### 🟡 Medium Priority Issues

#### 2. Sequential Batch Processing
**Problem:** Batches processed one at a time (100 ASINs every ~2-5 seconds)  
**Impact:** Slow for large catalogs (1000 ASINs = 10 batches = 20-50 seconds)  
**Improvement:** Parallel batch processing with concurrency limit

```javascript
// Process 3 batches in parallel
const batchPromises = [];
const CONCURRENT_BATCHES = 3;

for (let i = 0; i < missingImages.length; i += BATCH_SIZE) {
  batchPromises.push(processBatch(batch));
  
  if (batchPromises.length >= CONCURRENT_BATCHES) {
    await Promise.allSettled(batchPromises);
    batchPromises.length = 0;
  }
}
```

#### 3. No Retry Logic on Keepa API Failure
**Problem:** Single failed request loses entire batch  
**Impact:** Network hiccups cause permanent data loss  
**Improvement:** Exponential backoff retry for failed batches

#### 4. Individual Database Updates
**Problem:** One UPDATE query per ASIN (could be 100 queries/batch)  
**Impact:** Slow, high database load  
**Improvement:** Bulk update with array of IDs

```javascript
// Collect all updates for batch
const updates = batch.map(row => ({
  id: row.id,
  image_url: imageMap[row.asin]
})).filter(u => u.image_url);

// Single bulk update
await Promise.all(updates.map(u => 
  getSupabase()
    .from('catalog_imports')
    .update({ image_url: u.image_url })
    .eq('id', u.id)
));
```

### 🟢 Low Priority Enhancements

#### 5. Image Size Customization
**Current:** Hardcoded `._SL500_.jpg` (500px)  
**Enhancement:** Allow user to choose size (500, 1000, 1500) for higher quality

#### 6. Image Validation
**Missing:** No check if constructed URL actually works  
**Enhancement:** Validate image URLs return 200 status before saving

#### 7. Progress Streaming
**Current:** User sees only elapsed time, no per-batch progress  
**Enhancement:** WebSocket or polling to show "Batch 3/10 complete..."

#### 8. Keepa Token Budget Tracking
**Missing:** No warning if user is about to consume many tokens  
**Enhancement:** Show estimated token cost before fetch, track monthly usage

---

## 8. Testing Checklist

### Unit Tests Needed
- [ ] `keepaFetch()` helper function (once implemented)
- [ ] Image URL construction from image codes
- [ ] Batch splitting logic (100 ASINs per batch)
- [ ] `noImageAvailable` counting logic

### Integration Tests Needed
- [ ] Full fetch flow with mock Keepa API
- [ ] Database update verification
- [ ] Error handling for each scenario
- [ ] Batch processing with multiple batches

### Manual Testing Scenarios
1. **Happy Path:**
   - Import 250 ASINs without images
   - Click "Fetch Images from Keepa"
   - Verify 3 batches processed
   - Verify images appear in catalog

2. **No Images Available:**
   - Import ASINs known to have no Keepa images
   - Verify `noImageAvailable` count accurate
   - Verify no database updates occur

3. **Partial Failure:**
   - Mock Keepa API to fail batch 2 of 3
   - Verify batches 1 and 3 still succeed
   - Verify partial results returned

4. **Already Fetched:**
   - Fetch images for 100 ASINs
   - Click fetch again immediately
   - Verify no ASINs selected (early return)

5. **Keepa API Down:**
   - Mock Keepa API to return 500 error
   - Verify graceful error handling
   - Verify error message shown to user

---

## 9. Keepa API Documentation Reference

### Product Data API
**Official Docs:** https://keepa.com/#!discuss/t/product-object/116

**Relevant Fields:**
- `imagesCSV` - Comma-separated image codes
- `asin` - Product ASIN
- `title` - Product title (not used in this feature)

**Rate Limits:**
- 1 token per request (regardless of ASIN count)
- Max 100 ASINs per request
- No documented request rate limit

**Domain Codes:**
- `1` - Amazon.com (US)
- `2` - Amazon.co.uk
- `3` - Amazon.de
- etc.

---

## 10. Conclusion

The "Fetch Images from Keepa" feature provides bulk image retrieval for imported ASINs, reducing manual data entry and improving catalog completeness. However, the **critical bug** (undefined `keepaFetch` function) must be fixed immediately before the feature can function.

Once fixed, consider implementing:
1. Parallel batch processing (medium priority)
2. Retry logic (medium priority)
3. Bulk database updates (medium priority)

The feature follows a sound architectural pattern (batch processing, progress tracking, error isolation) but needs code completion and optimization.

---

**Analysis Complete**  
*Next Steps: Coordinate with Frontend Agent to verify UI behavior, DevOps Agent to check Keepa API key deployment.*
