#!/usr/bin/env node

/**
 * Migration script to add attachments column to mission_control_tasks table
 * Run with: node add-attachments-column.js
 */

const SUPABASE_URL = 'https://zzbzzpjqmbferplrwesn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Ynp6cGpxbWJmZXJwbHJ3ZXNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODE4ODkzOSwiZXhwIjoyMDgzNzY0OTM5fQ.CpY9YvI2nAm8idWancU2S75631MpXzyNt4_VV6ZPZME';

async function addAttachmentsColumn() {
  console.log('Adding attachments column to mission_control_tasks...');
  
  // First, check if the column already exists
  const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/mission_control_tasks?limit=1`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });

  if (checkResponse.ok) {
    const data = await checkResponse.json();
    if (data.length > 0 && 'attachments' in data[0]) {
      console.log('✅ Attachments column already exists!');
      return;
    }
  }

  // If not, we need to add it via SQL
  console.log('⚠️  The attachments column does not exist yet.');
  console.log('');
  console.log('Please run the following SQL in the Supabase SQL Editor:');
  console.log('');
  console.log('ALTER TABLE mission_control_tasks ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT \'[]\'::jsonb;');
  console.log('');
  console.log('Then run this script again to verify.');
  console.log('');
  console.log('Alternative: Go to https://zzbzzpjqmbferplrwesn.supabase.co/project/_/sql');
}

addAttachmentsColumn().catch(console.error);
