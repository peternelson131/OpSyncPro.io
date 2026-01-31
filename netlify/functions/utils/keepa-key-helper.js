/**
 * Keepa API Key Helper
 * 
 * Centralized utility for retrieving user's Keepa API key from encrypted storage.
 * Supports fallback to old plaintext column during migration period.
 * 
 * Usage:
 *   const { getUserKeepaKey } = require('./utils/keepa-key-helper');
 *   const apiKey = await getUserKeepaKey(userId, supabaseClient);
 */

const { decrypt } = require('./encryption');

/**
 * Get user's Keepa API key (decrypted)
 * 
 * @param {string} userId - User ID
 * @param {object} supabase - Supabase client instance
 * @param {boolean} allowFallback - Allow fallback to users.keepa_api_key (default: true)
 * @returns {Promise<string|null>} Decrypted API key or null if not found
 */
async function getUserKeepaKey(userId, supabase, allowFallback = true) {
  // Try new encrypted storage first
  const { data: keyData, error: keyError } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', 'keepa')
    .single();
  
  if (!keyError && keyData?.api_key_encrypted) {
    const decrypted = decrypt(keyData.api_key_encrypted);
    if (decrypted) {
      console.log(`✅ Retrieved Keepa key from encrypted storage for user ${userId}`);
      return decrypted;
    }
    console.log(`⚠️  Failed to decrypt Keepa key for user ${userId}`);
  }
  
  // Fallback to old plaintext column (during migration)
  if (allowFallback) {
    console.log(`⚠️  Falling back to users.keepa_api_key for user ${userId}`);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('keepa_api_key')
      .eq('id', userId)
      .single();
    
    if (!userError && userData?.keepa_api_key) {
      // Try to decrypt (in case it was already encrypted in the old column)
      const decrypted = decrypt(userData.keepa_api_key);
      if (decrypted) {
        return decrypted;
      }
      // Return as-is if not encrypted (plaintext)
      return userData.keepa_api_key;
    }
  }
  
  // No key found
  console.log(`❌ No Keepa API key found for user ${userId}`);
  return null;
}

/**
 * Get user's Keepa API key with system fallback
 * Falls back to KEEPA_API_KEY environment variable if user has no key
 * 
 * @param {string} userId - User ID
 * @param {object} supabase - Supabase client instance
 * @returns {Promise<string|null>} API key or null
 */
async function getUserKeepaKeyWithSystemFallback(userId, supabase) {
  const userKey = await getUserKeepaKey(userId, supabase, true);
  
  if (userKey) {
    return userKey;
  }
  
  // Fallback to system Keepa key
  const systemKey = process.env.KEEPA_API_KEY;
  if (systemKey) {
    console.log(`⚠️  Using system KEEPA_API_KEY for user ${userId}`);
    return systemKey;
  }
  
  return null;
}

module.exports = {
  getUserKeepaKey,
  getUserKeepaKeyWithSystemFallback
};
