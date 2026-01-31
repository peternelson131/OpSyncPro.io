/**
 * Shared OAuth utilities for all platform integrations
 * Provides common patterns for state management, token exchange, and error handling
 */

const crypto = require('crypto');

/**
 * Generate a secure state parameter for OAuth CSRF protection
 * @param {string} userId - User ID to embed in state
 * @param {Object} additionalData - Additional data to embed (optional)
 * @returns {string} - Base64-encoded state parameter
 */
function generateOAuthState(userId, additionalData = {}) {
  return Buffer.from(JSON.stringify({
    userId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
    ...additionalData
  })).toString('base64');
}

/**
 * Parse and validate state parameter from OAuth callback
 * @param {string} state - State parameter from OAuth callback
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 10 minutes)
 * @returns {Object} - Parsed state data or throws error
 */
function parseOAuthState(state, maxAgeMs = 10 * 60 * 1000) {
  if (!state) {
    throw new Error('Missing state parameter');
  }

  let stateData;
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error('Invalid state parameter format');
  }

  // Validate required fields
  if (!stateData.userId) {
    throw new Error('Invalid state: missing userId');
  }

  // Check timestamp if present
  if (stateData.timestamp) {
    const age = Date.now() - stateData.timestamp;
    if (age > maxAgeMs) {
      throw new Error('State parameter expired');
    }
  }

  return stateData;
}

/**
 * Store OAuth state in database for CSRF verification
 * @param {Object} supabase - Supabase client
 * @param {string} state - State parameter
 * @param {string} userId - User ID
 * @param {string} provider - OAuth provider name
 * @param {number} expiresInMs - Expiration time in milliseconds (default: 10 minutes)
 * @returns {Promise<void>}
 */
async function storeOAuthState(supabase, state, userId, provider, expiresInMs = 10 * 60 * 1000) {
  const expiresAt = new Date(Date.now() + expiresInMs);
  
  const { error } = await supabase
    .from('oauth_states')
    .insert({
      state,
      user_id: userId,
      provider,
      expires_at: expiresAt.toISOString()
    });
  
  if (error) {
    console.error('Error storing OAuth state:', error);
    throw new Error('Failed to store OAuth state');
  }
}

/**
 * Verify and retrieve OAuth state from database
 * @param {Object} supabase - Supabase client
 * @param {string} state - State parameter
 * @param {string} provider - OAuth provider name
 * @returns {Promise<Object>} - State data with userId
 */
async function verifyOAuthState(supabase, state, provider) {
  const { data, error } = await supabase
    .from('oauth_states')
    .select('user_id, provider, expires_at')
    .eq('state', state)
    .eq('provider', provider)
    .single();
  
  if (error || !data) {
    throw new Error('Invalid or expired state parameter');
  }
  
  // Check expiration
  if (new Date(data.expires_at) < new Date()) {
    throw new Error('OAuth state expired');
  }
  
  return {
    userId: data.user_id,
    provider: data.provider
  };
}

/**
 * Clean up used OAuth state from database
 * @param {Object} supabase - Supabase client
 * @param {string} state - State parameter to delete
 * @returns {Promise<void>}
 */
async function deleteOAuthState(supabase, state) {
  await supabase
    .from('oauth_states')
    .delete()
    .eq('state', state);
}

/**
 * Build redirect URL for OAuth callback
 * @param {string} baseUrl - Base URL of the application
 * @param {string} platform - Platform name (e.g., 'instagram', 'youtube')
 * @param {boolean} success - Whether OAuth was successful
 * @param {Object} data - Additional data to include in query params
 * @returns {string} - Full redirect URL
 */
function buildOAuthRedirectUrl(baseUrl, platform, success, data = {}) {
  const status = success ? 'connected' : 'error';
  const url = new URL(`${baseUrl}/integrations`);
  
  url.searchParams.set(platform, status);
  
  if (!success && data.error) {
    url.searchParams.set('message', data.error);
  }
  
  if (success && data.account) {
    url.searchParams.set('account', data.account);
  }
  
  return url.toString();
}

/**
 * Generate 302 redirect response
 * @param {string} url - URL to redirect to
 * @returns {Object} - Netlify function response
 */
function createRedirectResponse(url) {
  return {
    statusCode: 302,
    headers: {
      'Location': url,
      'Cache-Control': 'no-cache'
    },
    body: ''
  };
}

/**
 * Calculate token expiration timestamp
 * @param {number} expiresIn - Seconds until expiration
 * @returns {string} - ISO timestamp
 */
function calculateTokenExpiry(expiresIn) {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/**
 * Build OAuth authorization URL
 * @param {string} authUrl - Base OAuth authorization URL
 * @param {Object} params - URL parameters
 * @returns {string} - Complete authorization URL
 */
function buildAuthUrl(authUrl, params) {
  const url = new URL(authUrl);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(' '));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  });
  
  return url.toString();
}

/**
 * Extract OAuth error from query parameters
 * @param {Object} queryParams - Query string parameters
 * @returns {Object|null} - Error object or null
 */
function extractOAuthError(queryParams) {
  const { error, error_description, error_message, error_type } = queryParams || {};
  
  if (error || error_message || error_type) {
    return {
      error: error || error_type || 'unknown_error',
      description: error_description || error_message || 'OAuth authorization failed'
    };
  }
  
  return null;
}

/**
 * Validate required environment variables for OAuth provider
 * @param {string} provider - Provider name
 * @param {Array<string>} requiredVars - List of required env var names
 * @throws {Error} - If any required variables are missing
 */
function validateOAuthConfig(provider, requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(`Missing ${provider} OAuth config:`, missing);
    throw new Error(`${provider} OAuth not configured. Missing: ${missing.join(', ')}`);
  }
}

/**
 * Create a standardized OAuth error response
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} headers - Response headers
 * @returns {Object} - Netlify function response
 */
function createOAuthErrorResponse(statusCode, message, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      error: message,
      timestamp: new Date().toISOString()
    })
  };
}

module.exports = {
  generateOAuthState,
  parseOAuthState,
  storeOAuthState,
  verifyOAuthState,
  deleteOAuthState,
  buildOAuthRedirectUrl,
  createRedirectResponse,
  calculateTokenExpiry,
  buildAuthUrl,
  extractOAuthError,
  validateOAuthConfig,
  createOAuthErrorResponse
};
