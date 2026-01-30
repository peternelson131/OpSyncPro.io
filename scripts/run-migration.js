#!/usr/bin/env node

/**
 * Run database migration on UAT Supabase using direct postgres connection
 * Usage: node scripts/run-migration.js migrations/001_video_storage_migration.sql
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function runMigration() {
  // Read credentials
  const credPath = path.join(process.env.HOME, 'clawd/secrets/credentials.json');
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  
  const projectRef = credentials.supabase.projects.uat.projectRef;
  const serviceRoleKey = credentials.supabase.projects.uat.serviceRoleKey;
  
  console.log(`🎯 Running migration on UAT project: ${projectRef}`);
  
  // Read SQL file
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('❌ Usage: node run-migration.js <sql-file>');
    process.exit(1);
  }
  
  const sql = fs.readFileSync(sqlFile, 'utf8');
  console.log(`📄 Loaded SQL from: ${sqlFile}`);
  console.log(`📝 SQL length: ${sql.length} bytes`);
  
  // Connect to Supabase postgres using connection pooler
  const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(serviceRoleKey.split('.')[2] || 'INVALID')}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  
  console.log(`\n🔌 Connecting to database...`);
  
  // Actually, let me use the Supabase REST API to execute SQL - it's simpler
  const supabaseUrl = credentials.supabase.projects.uat.url;
  
  console.log('\n🚀 Executing migration SQL via Supabase REST API...\n');
  
  // Execute the full SQL block
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    console.log('✅ Migration executed successfully via REST API');
    
  } catch (restError) {
    console.log(`⚠️  REST API approach failed: ${restError.message}`);
    console.log(`\n🔄 Trying direct postgres connection...`);
    
    // Fallback: use direct postgres connection
    const client = new Client({
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: serviceRoleKey.split('.')[2] || credentials.supabase.projects.uat.serviceRoleKey,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      console.log('✅ Connected to database');
      
      // Execute the SQL
      console.log('\n📝 Executing SQL migration...');
      const result = await client.query(sql);
      
      console.log('✅ Migration executed successfully');
      console.log(`📊 Rows affected: ${result.rowCount || 'N/A'}`);
      
      await client.end();
      console.log('🔌 Database connection closed');
      
    } catch (pgError) {
      console.error(`❌ Postgres error: ${pgError.message}`);
      if (client) await client.end();
      throw pgError;
    }
  }
  
  console.log('\n🎉 Migration completed successfully!');
}

runMigration().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
