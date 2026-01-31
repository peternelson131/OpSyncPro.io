# OAuth Consolidation - OpSyncPro

**Branch:** `cleanup/oauth-consolidation`  
**Date:** January 31, 2026

## Summary

This consolidation removes duplicate and unused OAuth endpoint files, creates shared utilities, and documents the current OAuth architecture.

## What Was Consolidated

### 1. eBay OAuth Duplication (REMOVED)
- **Deleted:** `netlify/functions/ebay-auth-start.js`
- **Reason:** Duplicate of `ebay-oauth-start.js` with slightly different implementation
- **Frontend uses:** `ebay-oauth-start.js` (canonical version kept)
- **Impact:** No breaking changes - frontend already uses the canonical endpoint

### 2. Social Media Individual OAuth Endpoints (REMOVED)

These endpoints were superseded by the unified `social-accounts-connect.js` + `social-accounts-callback.js` system:

#### Meta/Facebook OAuth (REMOVED)
- **Deleted:** 
  - `netlify/functions/meta-auth.js`
  - `netlify/functions/meta-callback.js`
- **Reason:** Replaced by unified social accounts system
- **Database:** Used old `social_connections` table
- **Frontend uses:** `social-accounts-connect.js` with `platform: 'instagram'`

#### Instagram OAuth (REMOVED)
- **Deleted:**
  - `netlify/functions/instagram-auth.js`
  - `netlify/functions/instagram-callback.js`
- **Reason:** Replaced by unified social accounts system
- **Note:** Instagram OAuth is handled through Facebook/Meta OAuth in the unified system
- **Database:** Used old `social_connections` table
- **Frontend uses:** `social-accounts-connect.js` with `platform: 'instagram'`

#### YouTube OAuth (REMOVED)
- **Deleted:**
  - `netlify/functions/youtube-auth.js`
  - `netlify/functions/youtube-callback.js`
- **Reason:** Replaced by unified social accounts system
- **Database:** Used old `social_connections` table
- **Frontend uses:** `social-accounts-connect.js` with `platform: 'youtube'`

#### TikTok OAuth (REMOVED)
- **Deleted:**
  - `netlify/functions/tiktok-connect.js`
  - `netlify/functions/tiktok-callback.js`
- **Reason:** Replaced by unified social accounts system
- **Database:** Used old `social_accounts` table (Note: TikTok was already using the newer table)
- **Frontend uses:** `social-accounts-connect.js` with `platform: 'tiktok'`

### 3. Shared OAuth Utilities (CREATED)

**Created:** `netlify/functions/utils/oauth-helpers.js`

This new utility module provides common OAuth patterns:

#### State Management
- `generateOAuthState(userId, additionalData)` - Generate secure CSRF state parameter
- `parseOAuthState(state, maxAgeMs)` - Parse and validate state parameter
- `storeOAuthState(supabase, state, userId, provider, expiresInMs)` - Store state in database
- `verifyOAuthState(supabase, state, provider)` - Verify state from database
- `deleteOAuthState(supabase, state)` - Clean up used state

#### URL Building
- `buildAuthUrl(authUrl, params)` - Build OAuth authorization URL
- `buildOAuthRedirectUrl(baseUrl, platform, success, data)` - Build frontend redirect URL

#### Response Helpers
- `createRedirectResponse(url)` - Generate 302 redirect response
- `createOAuthErrorResponse(statusCode, message, headers)` - Standardized error response

#### Token Utilities
- `calculateTokenExpiry(expiresIn)` - Calculate token expiration timestamp

#### Error Handling
- `extractOAuthError(queryParams)` - Extract OAuth error from callback params
- `validateOAuthConfig(provider, requiredVars)` - Validate environment variables

## Current OAuth Architecture

### Active OAuth Systems

#### 1. Unified Social Accounts System (Instagram, YouTube, TikTok)
**Files:**
- `netlify/functions/social-accounts-connect.js` - OAuth initiator
- `netlify/functions/social-accounts-callback.js` - OAuth callback handler

**Features:**
- Generic platform-agnostic implementation
- Stores state in `oauth_states` table
- Stores accounts in `social_accounts` table
- Supports: Instagram (via Meta), YouTube (via Google), TikTok

**Flow:**
1. Frontend calls POST `/.netlify/functions/social-accounts-connect` with `{ platform: 'instagram' }`
2. Backend generates state, stores in DB, returns OAuth URL
3. User authorizes on platform
4. Platform redirects to `/.netlify/functions/social-accounts-callback`
5. Backend exchanges code for tokens, stores encrypted tokens in `social_accounts`
6. Redirects to `/integrations?social=connected`

#### 2. eBay OAuth System
**Files:**
- `netlify/functions/ebay-oauth-start.js` - OAuth initiator
- `netlify/functions/ebay-oauth-callback.js` - OAuth callback handler
- `netlify/functions/utils/ebay-oauth.js` - eBay-specific utilities

**Features:**
- Platform-level credentials (users don't need their own eBay app)
- Uses RuName for redirect URI
- Stores tokens in `users` table (not `social_accounts`)
- 18-month refresh tokens

**Flow:**
1. Frontend calls GET/POST `/.netlify/functions/ebay-oauth-start`
2. Backend generates state, returns eBay OAuth URL
3. User authorizes on eBay
4. eBay redirects to `/.netlify/functions/ebay-oauth-callback`
5. Backend exchanges code for tokens, stores encrypted in `users` table
6. Redirects to integrations page

#### 3. OneDrive OAuth System
**Files:**
- `netlify/functions/onedrive-auth-start.js`
- `netlify/functions/onedrive-callback.js`
- `netlify/functions/utils/onedrive-api.js`

**Status:** Separate system for file storage integration (not consolidated)

## Database Tables

### `oauth_states`
Temporary storage for CSRF state validation
- Columns: `state`, `user_id`, `provider`, `expires_at`
- Used by: Unified social accounts system
- Cleanup: States are deleted after use or expiration

### `social_accounts`
Social media account connections (NEW TABLE - unified system)
- Columns: `user_id`, `platform`, `username`, `account_id`, `access_token`, `refresh_token`, `token_expires_at`, `account_metadata`, `is_active`
- Used by: Instagram, YouTube, TikTok (via unified system)

### `social_connections`
Social media connections (OLD TABLE - deprecated)
- Used by: Legacy individual OAuth endpoints (now deleted)
- **Migration needed:** If production has data here, should migrate to `social_accounts`

### `users`
User table with OAuth tokens
- eBay tokens stored here: `ebay_access_token`, `ebay_refresh_token`, `ebay_token_expires_at`
- Different from social accounts storage pattern

## Breaking Changes

**None.** All deletions are of unused/duplicate endpoints.

- Frontend already uses the unified `social-accounts-connect` system
- Frontend already uses `ebay-oauth-start` (not the deleted `ebay-auth-start`)
- All deleted endpoints had zero references in the frontend code

## Potential Migration Needed

If production database has accounts in the old `social_connections` table, they should be migrated to `social_accounts` table. Check with:

```sql
SELECT COUNT(*) FROM social_connections WHERE platform IN ('instagram', 'youtube', 'tiktok', 'meta');
```

## What Was NOT Consolidated

### Legitimately Different OAuth Flows

The following were kept as separate implementations because they have fundamentally different requirements:

1. **eBay OAuth** - Uses platform credentials, RuName redirect, 18-month tokens, stores in `users` table
2. **OneDrive OAuth** - Separate file storage integration
3. **Unified Social System** - Generic multi-platform OAuth

These systems serve different purposes and have different storage patterns, so forcing consolidation would add complexity without benefit.

## Shared Utilities Available

All OAuth endpoints can now leverage `utils/oauth-helpers.js` for common operations:

```javascript
const {
  generateOAuthState,
  verifyOAuthState,
  buildAuthUrl,
  createRedirectResponse,
  validateOAuthConfig
} = require('./utils/oauth-helpers');
```

## Testing Recommendations

1. **Verify all OAuth flows still work:**
   - Instagram connection
   - YouTube connection
   - TikTok connection
   - eBay connection
   - Facebook connection (uses Instagram's Meta OAuth)

2. **Check database storage:**
   - New connections should appear in `social_accounts` table
   - eBay connections should appear in `users` table with `ebay_*` columns

3. **Test error handling:**
   - User denies permission
   - Invalid state parameter
   - Expired state parameter
   - Missing OAuth credentials in environment

## Files Summary

### Deleted (9 files)
1. `netlify/functions/ebay-auth-start.js`
2. `netlify/functions/meta-auth.js`
3. `netlify/functions/meta-callback.js`
4. `netlify/functions/instagram-auth.js`
5. `netlify/functions/instagram-callback.js`
6. `netlify/functions/youtube-auth.js`
7. `netlify/functions/youtube-callback.js`
8. `netlify/functions/tiktok-connect.js`
9. `netlify/functions/tiktok-callback.js`

### Created (1 file)
1. `netlify/functions/utils/oauth-helpers.js`

### Kept (Active OAuth Files)
1. `netlify/functions/ebay-oauth-start.js`
2. `netlify/functions/ebay-oauth-callback.js`
3. `netlify/functions/social-accounts-connect.js`
4. `netlify/functions/social-accounts-callback.js`
5. `netlify/functions/onedrive-auth-start.js`
6. `netlify/functions/onedrive-callback.js`
7. `netlify/functions/utils/ebay-oauth.js`
8. `netlify/functions/utils/onedrive-api.js`
9. `netlify/functions/utils/auth.js`
10. `netlify/functions/utils/social-token-encryption.js`

## Next Steps

1. **Review this consolidation** - Ensure the analysis is correct
2. **Test in UAT** - Verify all OAuth flows work
3. **Check production data** - See if `social_connections` table needs migration
4. **Consider refactoring** - eBay OAuth could potentially use shared helpers in the future
5. **Update documentation** - Add OAuth flow diagrams if needed
