#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const credPath = path.join(process.env.HOME, 'clawd/secrets/credentials.json');
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  
  const serviceRoleKey = credentials.supabase.projects.uat.serviceRoleKey;
  const supabaseUrl = credentials.supabase.projects.uat.url;
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  console.log('📦 Creating "product-videos" bucket (simplified)...\n');
  
  // Try without allowedMimeTypes first
  const { data, error } = await supabase.storage.createBucket('product-videos', {
    public: true,
    fileSizeLimit: 524288000 // 500MB
    // No MIME type restrictions
  });
  
  if (error) {
    console.error('❌ Error:', error.message);
    
    // Try with minimal options
    console.log('\nRetrying with minimal options...');
    const { data: data2, error: error2 } = await supabase.storage.createBucket('product-videos', {
      public: true
    });
    
    if (error2) {
      console.error('❌ Still failed:', error2.message);
    } else {
      console.log('✅ Bucket created with minimal options!');
    }
  } else {
    console.log('✅ Bucket created successfully!');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
