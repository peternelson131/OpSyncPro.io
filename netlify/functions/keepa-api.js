const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const { encrypt, isEncryptionConfigured } = require('./utils/encryption');
const { getUserKeepaKey } = require('./utils/keepa-key-helper');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Helper function to make HTTPS requests
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'User-Agent': 'eBay-Price-Reducer/1.0'
    };

    https.get(options, (res) => {
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);

      // Check if response is successful
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => {
          errorData += chunk;
        });
        res.on('end', () => {
          reject(new Error(`Keepa API returned status ${res.statusCode}: ${errorData}`));
        });
        return;
      }

      // Handle different content encodings
      let stream = res;
      const encoding = res.headers['content-encoding'];
      console.log('Content encoding:', encoding);

      if (encoding === 'gzip') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.on('data', (chunk) => {
        data += chunk;
      });
      stream.on('end', () => {
        console.log('Decompressed Keepa API response:', data);

        // Check if data looks like JSON
        if (!data || !data.trim().startsWith('{')) {
          reject(new Error(`Keepa API returned invalid response: ${data.substring(0, 100)}`));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          console.error('JSON parse error:', e);
          console.error('Raw data that failed to parse:', data);
          reject(new Error(`Keepa API returned invalid JSON: ${e.message}. Data: ${data.substring(0, 100)}`));
        }
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

// Encryption functions now imported from utils/encryption.js
// and utils/keepa-key-helper.js

// Get user from token
async function getUserFromToken(token) {
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}

// Main handler
exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  console.log('Keepa API function called:', {
    method: event.httpMethod,
    path: event.path,
    hasAuth: !!(event.headers.authorization || event.headers.Authorization)
  });

  try {
    // Get auth token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('No authentication token provided');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No authentication token provided'
        })
      };
    }

    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);

    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid or expired token'
        })
      };
    }

    // Parse the path to determine the operation
    const path = event.path.replace('/.netlify/functions/keepa-api', '');
    const segments = path.split('/').filter(s => s);

    console.log('Parsed path:', { originalPath: event.path, cleanPath: path, segments });

    // Handle different endpoints
    if (segments[0] === 'api-key' && event.httpMethod === 'POST') {
      console.log('Handling POST /api-key request');
      // Save API key
      const body = JSON.parse(event.body || '{}');
      const { apiKey } = body;

      if (!apiKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'API key is required'
          })
        };
      }

      // Validate API key with Keepa
      console.log('Validating Keepa API key...');
      console.log('API key length:', apiKey ? apiKey.length : 'undefined');
      console.log('API key format check:', apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'no key');

      let validation;
      try {
        const keepaUrl = `https://api.keepa.com/token?key=${apiKey}`;
        console.log('Calling Keepa API for validation...');
        validation = await httpsGet(keepaUrl);
        console.log('Keepa API response:', JSON.stringify(validation));
      } catch (keepaError) {
        console.error('Error calling Keepa API:', keepaError);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: `Keepa API validation failed: ${keepaError.message}`,
            error: keepaError.toString()
          })
        };
      }

      if (!validation || validation.tokensLeft === undefined) {
        console.error('Invalid Keepa response:', validation);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Invalid Keepa API key - no tokensLeft in response',
            validation: validation
          })
        };
      }

      try {
        // Verify encryption is configured
        if (!isEncryptionConfigured()) {
          console.error('ENCRYPTION_KEY not configured');
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'Server configuration error'
            })
          };
        }

        // Encrypt and save the API key
        const encryptedKey = encrypt(apiKey.trim());
        
        if (!encryptedKey) {
          console.error('Failed to encrypt API key');
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'Failed to secure API key'
            })
          };
        }

        console.log(`🔐 Encrypted Keepa key for user ${user.id}`);

        // Check if key already exists for this user/service
        const { data: existing } = await supabase
          .from('user_api_keys')
          .select('id')
          .eq('user_id', user.id)
          .eq('service', 'keepa')
          .single();

        if (existing) {
          // Update existing key
          const { error } = await supabase
            .from('user_api_keys')
            .update({
              api_key_encrypted: encryptedKey,
              is_valid: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (error) {
            console.error('Failed to update key:', error);
            throw error;
          }

          console.log('✅ Updated existing Keepa API key');
        } else {
          // Insert new key
          const { error } = await supabase
            .from('user_api_keys')
            .insert({
              user_id: user.id,
              service: 'keepa',
              api_key_encrypted: encryptedKey,
              label: 'default',
              is_valid: true
            });

          if (error) {
            console.error('Failed to insert key:', error);
            throw error;
          }

          console.log('✅ Created new Keepa API key');
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'API key saved successfully',
            validation: {
              tokensLeft: validation.tokensLeft
            }
          })
        };
      } catch (error) {
        console.error('Keepa API save error - Full details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          stack: error.stack
        });

        // Provide more specific error messages
        let errorMessage = 'Failed to save API key';
        if (error.code === '42P01') {
          errorMessage = 'Database table not found - please run migration';
        } else if (error.code === '42703') {
          errorMessage = 'Column keepa_api_key not found - please run migration to add it';
        } else if (error.message) {
          errorMessage = `Database error: ${error.message}`;
        }

        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: errorMessage,
            error: {
              code: error.code,
              details: error.message
            }
          })
        };
      }
    }

    if (segments[0] === 'test-connection' && event.httpMethod === 'GET') {
      // Test connection - fetch API key from encrypted storage
      const apiKey = await getUserKeepaKey(user.id, supabase, true);
      
      if (!apiKey) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            connected: false,
            message: 'No Keepa API key configured'
          })
        };
      }

      // Test the API key
      try {
        const data = await httpsGet(`https://api.keepa.com/token?key=${apiKey}`);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            connected: true,
            tokensLeft: data.tokensLeft,
            message: 'Connected to Keepa successfully'
          })
        };
      } catch (error) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            connected: false,
            message: 'Failed to connect to Keepa'
          })
        };
      }
    }

    // Handle product lookup via query parameters
    if (event.httpMethod === 'GET' && event.queryStringParameters) {
      const { action, asin } = event.queryStringParameters;

      if (action === 'product' && asin) {
        console.log('Product lookup requested for ASIN:', asin);

        // Get user's Keepa API key from encrypted storage
        const apiKey = await getUserKeepaKey(user.id, supabase, true);
        
        if (!apiKey) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'No Keepa API key configured. Please configure your Keepa API key first.'
            })
          };
        }

        // Fetch product data from Keepa
        try {
          // Keepa product API: https://api.keepa.com/product?key={key}&domain=1&asin={asin}
          // domain=1 is for Amazon.com
          const keepaUrl = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asin}&stats=1`;
          console.log('Fetching product data from Keepa...');

          const data = await httpsGet(keepaUrl);
          console.log('Keepa product response:', JSON.stringify(data));

          if (!data.products || data.products.length === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                success: false,
                message: `No product found for ASIN ${asin}`
              })
            };
          }

          const product = data.products[0];

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              product: {
                asin: product.asin,
                title: product.title,
                brand: product.brand,
                imagesCSV: product.imagesCSV,
                categoryTree: product.categoryTree,
                stats: product.stats
              }
            })
          };
        } catch (error) {
          console.error('Error fetching product from Keepa:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              message: `Failed to fetch product data: ${error.message}`
            })
          };
        }
      }
    }

    // Default response for unhandled routes
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Endpoint not found'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error.message
      })
    };
  }
};