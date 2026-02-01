import { supabase } from '../lib/supabase'

/**
 * Enhanced fetch wrapper that handles authentication and 401 errors
 * Automatically refreshes session on 401 and retries the request
 * 
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {Object} config - Additional configuration
 * @param {boolean} config.skipAuthRefresh - Skip automatic auth refresh on 401
 * @returns {Promise<Response>} The fetch response
 */
export async function fetchWithAuth(url, options = {}, config = {}) {
  const { skipAuthRefresh = false } = config

  // Get current session and add auth header
  const { data: { session } } = await supabase.auth.getSession()
  
  if (session?.access_token) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`
    }
  }

  // Make the initial request
  let response = await fetch(url, options)

  // Handle 401 Unauthorized
  if (response.status === 401 && !skipAuthRefresh) {
    console.warn('⚠️ 401 Unauthorized - attempting session refresh...')

    try {
      // Attempt to refresh the session
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError || !refreshedSession) {
        console.error('❌ Session refresh failed:', refreshError)
        
        // Redirect to login with message
        const currentPath = window.location.pathname
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}&message=${encodeURIComponent('Your session has expired. Please log in again.')}`
        
        throw new Error('Session expired. Please log in again.')
      }

      console.log('✅ Session refreshed, retrying request...')

      // Retry the request with the new token
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${refreshedSession.access_token}`
      }

      response = await fetch(url, options)

      // If still 401 after refresh, redirect to login
      if (response.status === 401) {
        console.error('❌ Still unauthorized after refresh - redirecting to login')
        const currentPath = window.location.pathname
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}&message=${encodeURIComponent('Authentication failed. Please log in again.')}`
        throw new Error('Authentication failed after refresh')
      }
    } catch (error) {
      console.error('❌ Error handling 401:', error)
      throw error
    }
  }

  return response
}

/**
 * Wrapper for fetchWithAuth that automatically parses JSON response
 * 
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {Object} config - Additional configuration
 * @returns {Promise<any>} The parsed JSON response
 */
export async function fetchJSON(url, options = {}, config = {}) {
  const response = await fetchWithAuth(url, options, config)
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const error = new Error(errorData.error || errorData.message || `HTTP ${response.status}`)
    error.status = response.status
    error.data = errorData
    throw error
  }

  return response.json()
}

/**
 * Check if current session is valid
 * @returns {Promise<boolean>}
 */
export async function isSessionValid() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return false
    }

    // Check if session is expired or about to expire (within 1 minute)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const timeUntilExpiry = expiresAt - now

    return timeUntilExpiry > 60
  } catch (error) {
    console.error('❌ Error checking session validity:', error)
    return false
  }
}

/**
 * Ensure session is valid, refresh if needed
 * @returns {Promise<{valid: boolean, session: Session | null}>}
 */
export async function ensureValidSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return { valid: false, session: null }
    }

    // Check if session is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const timeUntilExpiry = expiresAt - now

    if (timeUntilExpiry < 300) {
      console.log('⏰ Session expiring soon, refreshing...')
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
      
      if (refreshError || !refreshedSession) {
        console.error('❌ Session refresh failed:', refreshError)
        return { valid: false, session: null }
      }

      return { valid: true, session: refreshedSession }
    }

    return { valid: true, session }
  } catch (error) {
    console.error('❌ Error ensuring valid session:', error)
    return { valid: false, session: null }
  }
}

export default fetchWithAuth
