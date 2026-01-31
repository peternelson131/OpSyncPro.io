/**
 * Migrate Keepa API Keys from plaintext to encrypted storage
 * 
 * This script:
 * 1. Reads all keepa_api_key values from users table
 * 2. Encrypts them using the existing AES-256-CBC encryption
 * 3. Inserts into user_api_keys table with service='keepa'
 * 4. Does NOT delete the old column (for rollback safety)
 * 
 * Usage:
 *   ENVIRONMENT=uat node scripts/migrate-keepa-keys.js
 *   ENVIRONMENT=production node scripts/migrate-keepa-keys.js
 */

const { createClient } = require('@supabase/supabase-js');
const { encrypt } = require('../netlify/functions/utils/encryption');

// Get environment from command line or env var
const ENVIRONMENT = process.env.ENVIRONMENT || 'uat';

// Supabase configuration
const CONFIG = {
  uat: {
    url: 'https://zzbzzpjqmbferplrwesn.supabase.co',
    serviceKey: 'sb_secret_g6t7QE4CnF9fb0A0HgdwKw_9iWqyD3H'
  },
  production: {
    url: 'https://zxcdkanccbdeqebnabgg.supabase.co',
    serviceKey: 'sb_secret_-6qzsX1tCXSjVjMWghmYwQ_SG8GxGs2'
  }
};

// Validate environment
if (!CONFIG[ENVIRONMENT]) {
  console.error(`❌ Invalid environment: ${ENVIRONMENT}`);
  console.error(`Valid options: ${Object.keys(CONFIG).join(', ')}`);
  process.exit(1);
}

// Require explicit confirmation for production
if (ENVIRONMENT === 'production') {
  console.error('❌ PRODUCTION MIGRATION DISABLED');
  console.error('This script is configured for UAT only. Remove this check if you really want to run in production.');
  process.exit(1);
}

const config = CONFIG[ENVIRONMENT];
const supabase = createClient(config.url, config.serviceKey);

/**
 * Main migration function
 */
async function migrateKeepaKeys() {
  console.log(`\n🔐 Keepa API Key Migration - ${ENVIRONMENT.toUpperCase()}`);
  console.log('═'.repeat(60));
  
  try {
    // Step 1: Get all users with keepa_api_key
    console.log('\n📊 Step 1: Fetching users with Keepa API keys...');
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, email, keepa_api_key')
      .not('keepa_api_key', 'is', null);
    
    if (fetchError) {
      throw new Error(`Failed to fetch users: ${fetchError.message}`);
    }
    
    console.log(`   Found ${users.length} users with Keepa API keys`);
    
    if (users.length === 0) {
      console.log('\n✅ No users to migrate. Done!');
      return;
    }
    
    // Step 2: For each user, encrypt and insert into user_api_keys
    console.log('\n🔒 Step 2: Encrypting and migrating keys...');
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const user of users) {
      try {
        // Check if key already exists in user_api_keys
        const { data: existing } = await supabase
          .from('user_api_keys')
          .select('id')
          .eq('user_id', user.id)
          .eq('service', 'keepa')
          .single();
        
        if (existing) {
          console.log(`   ⏭️  User ${user.email}: Already has encrypted key, skipping`);
          skipped++;
          continue;
        }
        
        // Encrypt the API key
        const encryptedKey = encrypt(user.keepa_api_key);
        
        if (!encryptedKey) {
          console.log(`   ❌ User ${user.email}: Failed to encrypt key`);
          errors++;
          continue;
        }
        
        // Insert into user_api_keys
        const { error: insertError } = await supabase
          .from('user_api_keys')
          .insert({
            user_id: user.id,
            service: 'keepa',
            api_key_encrypted: encryptedKey,
            label: 'migrated',
            is_valid: true
          });
        
        if (insertError) {
          console.log(`   ❌ User ${user.email}: Insert failed - ${insertError.message}`);
          errors++;
          continue;
        }
        
        console.log(`   ✅ User ${user.email}: Migrated successfully`);
        migrated++;
        
      } catch (userError) {
        console.log(`   ❌ User ${user.email}: ${userError.message}`);
        errors++;
      }
    }
    
    // Step 3: Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📈 Migration Summary:');
    console.log(`   Total users:     ${users.length}`);
    console.log(`   ✅ Migrated:     ${migrated}`);
    console.log(`   ⏭️  Skipped:      ${skipped} (already encrypted)`);
    console.log(`   ❌ Errors:       ${errors}`);
    console.log('═'.repeat(60));
    
    if (errors > 0) {
      console.log('\n⚠️  Some migrations failed. Review errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Deploy updated Netlify functions');
      console.log('   2. Test Keepa functionality in UAT');
      console.log('   3. Monitor for issues');
      console.log('   4. After verification, deprecate users.keepa_api_key column\n');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrateKeepaKeys();
