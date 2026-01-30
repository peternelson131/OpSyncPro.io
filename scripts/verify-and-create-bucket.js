#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const credPath = path.join(process.env.HOME, 'clawd/secrets/credentials.json');
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  
  const serviceRoleKey = credentials.supabase.projects.uat.serviceRoleKey;
  const supabaseUrl = credentials.supabase.projects.uat.url;
  
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  
  console.log('🔍 Checking existing buckets...\n');
  
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ List error:', listError.message);
    return;
  }
  
  console.log(`Found ${buckets.length} buckets:`);
  buckets.forEach(b => console.log(`  - ${b.name} (public: ${b.public})`));
  
  const exists = buckets.some(b => b.name === 'product-videos');
  
  if (exists) {
    console.log('\n✅ Bucket "product-videos" already exists!\n');
    return;
  }
  
  console.log('\n📦 Creating "product-videos" bucket...\n');
  
  const { data, error } = await supabase.storage.createBucket('product-videos', {
    public: true,
    fileSizeLimit: 500 * 1024 * 1024, // 500MB in bytes
    allowedMimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'video/x-matroska',
      'video/avi'
    ]
  });
  
  if (error) {
    console.error('❌ Creation error:', error.message);
    console.error('Full error:', error);
  } else {
    console.log('✅ Bucket created successfully!');
    console.log('Data:', data);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
