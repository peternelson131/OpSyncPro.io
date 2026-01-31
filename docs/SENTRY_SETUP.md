# Sentry Error Monitoring Setup

This document explains how to configure and use Sentry error monitoring in OpSyncPro.

## Overview

Sentry is integrated into both the **frontend** (React) and **backend** (Netlify Functions) to proactively capture errors, exceptions, and performance issues before users report them.

**Key Features:**
- ✅ Automatic error tracking in production and UAT environments
- ✅ Performance monitoring and tracing
- ✅ Session replay for debugging user issues
- ✅ Graceful degradation - works with or without Sentry configured
- ✅ Zero impact when DSN is not provided

---

## 1. Create a Sentry Project

### Step 1: Sign up for Sentry
1. Go to https://sentry.io
2. Create a free account (100k errors/month on free tier)
3. Create a new project:
   - **Platform:** JavaScript → React (for frontend)
   - **Project Name:** OpSyncPro Frontend
   - **Alert Frequency:** Real-time

### Step 2: Create Backend Project
1. Create another project for backend:
   - **Platform:** Node.js
   - **Project Name:** OpSyncPro Backend
   - **Alert Frequency:** Real-time

### Step 3: Get DSN Keys
After creating each project, Sentry will provide a **DSN** (Data Source Name) that looks like:
```
https://abc123def456@o1234567.ingest.sentry.io/7654321
```

You'll have **two DSNs:**
- Frontend DSN (for React app)
- Backend DSN (for Netlify Functions)

---

## 2. Configure Environment Variables

### Frontend (React)
Add this to your **Netlify environment variables** or `.env` file:

```bash
VITE_SENTRY_DSN=https://YOUR_FRONTEND_DSN_HERE
VITE_APP_VERSION=1.0.0  # Optional: for release tracking
```

### Backend (Netlify Functions)
Add this to your **Netlify environment variables**:

```bash
SENTRY_DSN=https://YOUR_BACKEND_DSN_HERE
```

### Setting in Netlify Dashboard
1. Go to **Site settings** → **Environment variables**
2. Click **Add a variable**
3. Set the key-value pairs above
4. Deploy site for changes to take effect

---

## 3. What's Monitored

### Frontend (`@sentry/react`)
**Automatic:**
- Unhandled exceptions in React components
- Promise rejections
- Network errors
- React component errors (via ErrorBoundary)
- Performance metrics (page load, navigation)
- Session replays on errors (10% of all sessions, 100% of error sessions)

**Environment Detection:**
- `localhost` / `127.0.0.1` → `development`
- URLs with `uat` / `staging` → `uat`
- All others → `production`

**Location:** `frontend/src/main.jsx`

### Backend (`@sentry/node`)
**Automatic (for wrapped functions):**
- Unhandled exceptions
- Promise rejections
- HTTP request context (method, path, headers)
- Function name and route
- Performance tracing

**Currently Wrapped Functions:**
1. ✅ `auth-login.js` - Authentication errors
2. ✅ `catalog-import.js` - Import failures
3. ✅ `auto-list-single.js` - eBay listing errors
4. ✅ `social-post.js` - Social media posting errors

**Environment Detection:**
- Netlify `CONTEXT=production` → `production`
- Netlify `CONTEXT=deploy-preview` / `branch-deploy` → `uat`
- All others → `development`

---

## 4. How to Add Sentry to More Functions

To add Sentry error tracking to additional Netlify functions:

### Step 1: Import the wrapper
At the top of your function file:
```javascript
const { wrapHandler } = require('./utils/sentry');
```

### Step 2: Refactor your handler
Change from:
```javascript
exports.handler = async (event, context) => {
  // your code
};
```

To:
```javascript
const handler = async (event, context) => {
  // your code
};

// Wrap handler with Sentry error tracking
exports.handler = wrapHandler(handler);
```

That's it! Errors will now be automatically captured.

---

## 5. Manual Error Tracking

For custom error tracking in your functions:

```javascript
const { captureException, captureMessage } = require('./utils/sentry');

// Capture an exception
try {
  await riskyOperation();
} catch (error) {
  captureException(error, {
    tags: { feature: 'payment' },
    extra: { userId: user.id }
  });
  throw error; // Re-throw if needed
}

// Capture a message
captureMessage('User attempted unauthorized action', 'warning');
```

---

## 6. Testing Sentry Integration

### Frontend Test
1. Add `VITE_SENTRY_DSN` to your Netlify environment variables
2. Deploy the app
3. Open browser console and run:
   ```javascript
   throw new Error("Test Sentry Frontend");
   ```
4. Check Sentry dashboard → Frontend project → Issues

### Backend Test
1. Add `SENTRY_DSN` to your Netlify environment variables
2. Deploy the app
3. Trigger an error in a wrapped function (e.g., invalid login)
4. Check Sentry dashboard → Backend project → Issues

---

## 7. Graceful Degradation

**The app works identically with or without Sentry configured.**

If `VITE_SENTRY_DSN` or `SENTRY_DSN` is **not set:**
- ✅ App functions normally
- ✅ No errors or warnings (just a console log)
- ✅ No performance impact
- ❌ Errors are not tracked remotely

If DSN **is set:**
- ✅ All errors are tracked and reported to Sentry
- ✅ Performance metrics collected
- ✅ Session replays captured on errors

---

## 8. Monitoring Dashboard

Once configured, access your Sentry dashboard at:
- https://sentry.io/organizations/YOUR_ORG/projects/

You'll see:
- **Issues** - Errors grouped by type with stack traces
- **Performance** - API response times, slow queries
- **Releases** - Track errors per deployment
- **Alerts** - Email/Slack notifications on errors

---

## 9. Best Practices

✅ **DO:**
- Set DSN in production and UAT environments
- Review Sentry issues weekly
- Add context to manual captures (user ID, action, etc.)
- Use Sentry releases to track which deployment caused errors

❌ **DON'T:**
- Commit DSN keys to git (use environment variables)
- Log sensitive data (passwords, tokens) in error context
- Ignore repeated errors (fix root causes)

---

## 10. Cost & Limits

**Free Tier:**
- 100,000 errors/month
- 10,000 performance units/month
- 50 session replays/month
- 90-day data retention

**If you exceed limits:**
- Sentry will stop accepting new events until next month
- App continues to work normally (graceful degradation)

---

## Support

For Sentry-specific issues:
- Documentation: https://docs.sentry.io/platforms/javascript/guides/react/
- Node.js Guide: https://docs.sentry.io/platforms/node/

For OpSyncPro integration issues:
- Check `netlify/functions/utils/sentry.js` for backend logic
- Check `frontend/src/main.jsx` for frontend initialization
