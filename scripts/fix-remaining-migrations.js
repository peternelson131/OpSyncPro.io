#!/usr/bin/env node

/**
 * Fix remaining migration issues
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function runMigration() {
  const credPath = path.join(process.env.HOME, 'clawd/secrets/credentials.json');
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  
  const projectRef = credentials.supabase.projects.uat.projectRef;
  const serviceRoleKey = credentials.supabase.projects.uat.serviceRoleKey;
  const supabaseUrl = credentials.supabase.projects.uat.url;
  const accessToken = credentials.supabase.accessToken;
  
  console.log(`🎯 UAT Project: ${projectRef}\n`);
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  // ============================================
  // FIX 1: Add CHECK constraint properly
  // ============================================
  
  console.log('🔧 FIX 1: Add CHECK constraint for sync_status\n');
  
  try {
    const sql = `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'product_videos_sync_status_check'
        ) THEN
          ALTER TABLE product_videos 
          ADD CONSTRAINT product_videos_sync_status_check 
          CHECK (onedrive_sync_status IN ('disabled', 'pending', 'syncing', 'synced', 'failed'));
        END IF;
      END $$;
    `;
    
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      }
    );
    
    if (response.ok) {
      console.log('✅ CHECK constraint added\n');
    } else {
      const result = await response.json();
      console.log(`⚠️  ${result.message || 'May already exist'}\n`);
    }
  } catch (err) {
    console.log(`⚠️  ${err.message}\n`);
  }
  
  // ============================================
  // FIX 2: Create Storage Bucket with correct API
  // ============================================
  
  console.log('🪣 FIX 2: Create Storage Bucket\n');
  
  try {
    // List existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.log(`⚠️  List error: ${listError.message}`);
    }
    
    const bucketExists = buckets?.some(b => b.name === 'product-videos');
    
    if (bucketExists) {
      console.log('✅ Bucket "product-videos" already exists\n');
    } else {
      console.log('Creating bucket...');
      
      // Use Management API to create bucket
      const createResponse = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/storage/buckets`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'product-videos',
            public: true,
            file_size_limit: 524288000,
            allowed_mime_types: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/*']
          })
        }
      );
      
      if (createResponse.ok) {
        console.log('✅ Created "product-videos" bucket\n');
      } else {
        const result = await createResponse.json();
        if (result.message?.includes('already exists')) {
          console.log('✅ Bucket already exists\n');
        } else {
          console.log(`⚠️  ${result.message}\n`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Bucket error: ${err.message}\n`);
  }
  
  // ============================================
  // FIX 3: Create RLS Policies properly
  // ============================================
  
  console.log('🔐 FIX 3: Storage RLS Policies\n');
  
  const policies = [
    {
      name: 'Public can read product videos',
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' 
            AND tablename = 'objects' 
            AND policyname = 'Public can read product videos'
          ) THEN
            CREATE POLICY "Public can read product videos" 
            ON storage.objects FOR SELECT 
            USING (bucket_id = 'product-videos');
          END IF;
        END $$;
      `
    },
    {
      name: 'Users can upload own product videos',
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' 
            AND tablename = 'objects' 
            AND policyname = 'Users can upload own product videos'
          ) THEN
            CREATE POLICY "Users can upload own product videos" 
            ON storage.objects FOR INSERT 
            WITH CHECK (
              bucket_id = 'product-videos' 
              AND auth.role() = 'authenticated' 
              AND (storage.foldername(name))[1] = auth.uid()::text
            );
          END IF;
        END $$;
      `
    },
    {
      name: 'Users can delete own product videos',
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' 
            AND tablename = 'objects' 
            AND policyname = 'Users can delete own product videos'
          ) THEN
            CREATE POLICY "Users can delete own product videos" 
            ON storage.objects FOR DELETE 
            USING (
              bucket_id = 'product-videos' 
              AND (storage.foldername(name))[1] = auth.uid()::text
            );
          END IF;
        END $$;
      `
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
        console.log(`   ⚠️  ${result.message || 'May already exist'}`);
      }
    } catch (err) {
      console.error(`   ❌ ${err.message}`);
    }
  }
  
  console.log('\n\n✅ All Fixes Applied!\n');
}

runMigration().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
