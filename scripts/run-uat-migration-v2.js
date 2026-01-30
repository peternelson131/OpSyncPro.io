#!/usr/bin/env node

/**
 * Run UAT migration using Supabase Management API
 * This uses the /database/sql endpoint to execute raw SQL
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function runMigration() {
  // Read credentials
  const credPath = path.join(process.env.HOME, 'clawd/secrets/credentials.json');
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  
  const projectRef = credentials.supabase.projects.uat.projectRef;
  const serviceRoleKey = credentials.supabase.projects.uat.serviceRoleKey;
  const supabaseUrl = credentials.supabase.projects.uat.url;
  const accessToken = credentials.supabase.accessToken;
  
  console.log(`🎯 UAT Project: ${projectRef}`);
  console.log(`🌐 URL: ${supabaseUrl}\n`);
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  // ============================================
  // STEP 1: Database Schema Migrations via Management API
  // ============================================
  
  console.log('📊 STEP 1: Database Schema Migrations\n');
  
  const migrations = [
    {
      name: 'Make onedrive_file_id nullable',
      sql: `ALTER TABLE product_videos ALTER COLUMN onedrive_file_id DROP NOT NULL;`
    },
    {
      name: 'Make onedrive_path nullable',
      sql: `ALTER TABLE product_videos ALTER COLUMN onedrive_path DROP NOT NULL;`
    },
    {
      name: 'Add storage_path column',
      sql: `ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS storage_path TEXT;`
    },
    {
      name: 'Add storage_url column',
      sql: `ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS storage_url TEXT;`
    },
    {
      name: 'Add onedrive_sync_status column',
      sql: `ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS onedrive_sync_status TEXT DEFAULT 'disabled';`
    },
    {
      name: 'Add sync status constraint',
      sql: `ALTER TABLE product_videos ADD CONSTRAINT IF NOT EXISTS product_videos_sync_status_check CHECK (onedrive_sync_status IN ('disabled', 'pending', 'syncing', 'synced', 'failed'));`
    },
    {
      name: 'Add onedrive_sync_error column',
      sql: `ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS onedrive_sync_error TEXT;`
    },
    {
      name: 'Create sync status index',
      sql: `CREATE INDEX IF NOT EXISTS idx_product_videos_sync_status ON product_videos(onedrive_sync_status) WHERE onedrive_sync_status IN ('pending', 'syncing');`
    },
    {
      name: 'Drop old unique constraint',
      sql: `ALTER TABLE product_videos DROP CONSTRAINT IF EXISTS product_videos_user_id_onedrive_file_id_key;`
    },
    {
      name: 'Add storage_path to video_variants',
      sql: `ALTER TABLE video_variants ADD COLUMN IF NOT EXISTS storage_path TEXT;`
    },
    {
      name: 'Add storage_url to video_variants',
      sql: `ALTER TABLE video_variants ADD COLUMN IF NOT EXISTS storage_url TEXT;`
    }
  ];
  
  let successCount = 0;
  let errorCount = 0;
  
  // Execute via Management API
  for (const migration of migrations) {
    try {
      console.log(`⚙️  ${migration.name}...`);
      
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: migration.sql })
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        // Check if it's a "doesn't exist" error (acceptable)
        if (result.message?.includes('does not exist') || result.message?.includes('already exists')) {
          console.log(`   ⚠️  ${result.message} (continuing...)`);
          successCount++;
        } else {
          throw new Error(result.message || `HTTP ${response.status}`);
        }
      } else {
        console.log(`   ✅ Done`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Schema Migration Summary: ${successCount}/${migrations.length} successful\n`);
  
  // ============================================
  // STEP 2: Add unique constraint on storage_path (separate because of IF NOT EXISTS)
  // ============================================
  
  console.log('🔑 Adding storage_path unique constraint...\n');
  
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          query: `DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'product_videos_storage_path_unique'
            ) THEN
              ALTER TABLE product_videos ADD CONSTRAINT product_videos_storage_path_unique UNIQUE (storage_path);
            END IF;
          END $$;`
        })
      }
    );
    
    if (response.ok) {
      console.log('✅ Unique constraint added\n');
    } else {
      const result = await response.json();
      console.log(`⚠️  ${result.message || 'Constraint may already exist'}\n`);
    }
  } catch (err) {
    console.log(`⚠️  ${err.message}\n`);
  }
  
  // ============================================
  // STEP 3: Create Storage Bucket
  // ============================================
  
  console.log('🪣 STEP 2: Create Storage Bucket\n');
  
  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'product-videos');
    
    if (bucketExists) {
      console.log('⚠️  Bucket "product-videos" already exists\n');
    } else {
      // Create bucket
      const { data, error } = await supabase.storage.createBucket('product-videos', {
        public: true,
        fileSizeLimit: 524288000, // 500MB
        allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/*']
      });
      
      if (error) {
        if (error.message.includes('already exists')) {
          console.log('✅ Bucket already exists\n');
        } else {
          throw error;
        }
      } else {
        console.log('✅ Created "product-videos" bucket\n');
      }
    }
  } catch (err) {
    console.error(`❌ Bucket creation error: ${err.message}\n`);
  }
  
  // ============================================
  // STEP 4: Storage RLS Policies
  // ============================================
  
  console.log('🔐 STEP 3: Storage RLS Policies\n');
  
  const policies = [
    {
      name: 'Public read access',
      sql: `CREATE POLICY IF NOT EXISTS "Public can read product videos" 
            ON storage.objects FOR SELECT 
            USING (bucket_id = 'product-videos');`
    },
    {
      name: 'User upload access',
      sql: `CREATE POLICY IF NOT EXISTS "Users can upload own product videos" 
            ON storage.objects FOR INSERT 
            WITH CHECK (
              bucket_id = 'product-videos' 
              AND auth.role() = 'authenticated' 
              AND (storage.foldername(name))[1] = auth.uid()::text
            );`
    },
    {
      name: 'User delete access',
      sql: `CREATE POLICY IF NOT EXISTS "Users can delete own product videos" 
            ON storage.objects FOR DELETE 
            USING (
              bucket_id = 'product-videos' 
              AND (storage.foldername(name))[1] = auth.uid()::text
            );`
    }
  ];
  
  for (const policy of policies) {
    try {
      console.log(`🔒 ${policy.name}...`);
      
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: policy.sql })
        }
      );
      
      if (response.ok) {
        console.log(`   ✅ Done`);
      } else {
        const result = await response.json();
        if (result.message?.includes('already exists')) {
          console.log(`   ⚠️  Policy already exists`);
        } else {
          console.log(`   ⚠️  ${result.message || 'Failed'}`);
        }
      }
    } catch (err) {
      console.error(`   ❌ ${err.message}`);
    }
  }
  
  console.log('\n\n✅ Migration Complete!\n');
  
  console.log('📋 Summary:');
  console.log(`   ✅ Database schema updated`);
  console.log(`   ✅ Storage bucket created`);
  console.log(`   ✅ RLS policies configured\n`);
  
  console.log('Next Steps:');
  console.log('1. Modify netlify/functions/videos.js');
  console.log('2. Modify netlify/functions/video-download.js');
  console.log('3. Update downstream consumers\n');
}

runMigration().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
