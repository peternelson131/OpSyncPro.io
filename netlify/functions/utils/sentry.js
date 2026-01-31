const Sentry = require('@sentry/node');

// Track if Sentry is initialized
let isInitialized = false;

/**
 * Initialize Sentry for Netlify Functions
 * Gracefully skips initialization if SENTRY_DSN is not set
 */
function initSentry() {
  if (isInitialized) return;

  const SENTRY_DSN = process.env.SENTRY_DSN;
  
  if (!SENTRY_DSN) {
    console.log('ℹ️ Sentry not initialized (SENTRY_DSN not set)');
    return;
  }

  // Detect environment from Netlify context or fallback
  const environment = process.env.CONTEXT === 'production'
    ? 'production'
    : process.env.CONTEXT === 'deploy-preview' || process.env.CONTEXT === 'branch-deploy'
    ? 'uat'
    : 'development';

  Sentry.init({
    dsn: SENTRY_DSN,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Release tracking
    release: process.env.COMMIT_REF || 'unknown',
  });

  isInitialized = true;
  console.log('✅ Sentry initialized for environment:', environment);
}

/**
 * Wrap a Netlify function handler to automatically capture errors
 * @param {Function} handler - The original Netlify function handler
 * @returns {Function} Wrapped handler with error tracking
 */
function wrapHandler(handler) {
  // Initialize on first use
  initSentry();

  return async (event, context) => {
    try {
      const result = await handler(event, context);
      return result;
    } catch (error) {
      // Capture the error in Sentry if initialized
      if (isInitialized) {
        Sentry.captureException(error, {
          tags: {
            function: event.rawUrl ? new URL(event.rawUrl).pathname : 'unknown',
            method: event.httpMethod,
          },
          extra: {
            headers: event.headers,
            queryParams: event.queryStringParameters,
            // Don't log body to avoid leaking sensitive data
          },
        });
      }

      // Log to console for Netlify logs
      console.error('Function error:', error);

      // Re-throw to let Netlify handle the error response
      throw error;
    }
  };
}

/**
 * Manually capture an exception
 * Safe to call even if Sentry is not initialized
 */
function captureException(error, context = {}) {
  if (isInitialized) {
    Sentry.captureException(error, context);
  }
}

/**
 * Manually capture a message
 * Safe to call even if Sentry is not initialized
 */
function captureMessage(message, level = 'info') {
  if (isInitialized) {
    Sentry.captureMessage(message, level);
  }
}

module.exports = {
  initSentry,
  wrapHandler,
  captureException,
  captureMessage,
};
