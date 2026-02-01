/**
 * Background worker to process Keepa enrichment jobs
 * 
 * Processes batches of ASINs (up to 100 per batch, 3 concurrent batches)
 * Fetches product data from Keepa API and updates catalog_imports
 * Tracks progress in enrichment_jobs table for real-time UI updates
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzipAsync = promisify(zlib.gunzip);

// Lazy-init Supabase client
let supabase = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Fetch and decompress Keepa API response (handles gzip)
 */
async function keepaFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          
          // Check if response is gzipped (Keepa always gzips)
          const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
          
          let data;
          if (isGzip) {
            const decompressed = await gunzipAsync(buffer);
            data = JSON.parse(decompressed.toString());
          } else {
            data = JSON.parse(buffer.toString());
          }
          
          resolve(data);
        } catch (error) {
          console.error('Keepa decompression error:', error);
          reject(new Error(`Failed to decompress Keepa response: ${error.message}`));
        }
      });
      
      res.on('error', (error) => {
        console.error('Keepa request error:', error);
        reject(new Error(`Keepa API request failed: ${error.message}`));
      });
    }).on('error', (error) => {
      console.error('HTTPS request error:', error);
      reject(new Error(`HTTPS request failed: ${error.message}`));
    });
  });
}

/**
 * Process a batch of ASINs (up to 100) with Keepa API
 */
async function processBatch(asins, userId, jobId, batchNum, totalBatches) {
  const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
  
  console.log(`📦 Batch ${batchNum}/${totalBatches}: Processing ${asins.length} ASINs`);
  
  const keepaUrl = `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=1&asin=${asins.join(',')}`;
  
  try {
    const keepaData = await keepaFetch(keepaUrl);
    
    if (keepaData.error) {
      console.error(`Batch ${batchNum} Keepa error:`, keepaData.error);
      return {
        success: false,
        enriched: 0,
        failed: asins.length,
        tokensConsumed: keepaData.tokensConsumed || 0
      };
    }
    
    const products = keepaData.products || [];
    const tokensConsumed = keepaData.tokensConsumed || 0;
    
    console.log(`📸 Batch ${batchNum}: Received ${products.length} products from Keepa`);
    
    // Build enrichment data map
    const enrichmentMap = {};
    const productMap = new Map(products.map(p => [p.asin, p]));
    
    let enriched = 0;
    let failed = 0;
    
    for (const asin of asins) {
      const product = productMap.get(asin);
      
      if (!product) {
        console.log(`  ⚠️ ${asin}: Not found in Keepa`);
        failed++;
        enrichmentMap[asin] = { status: 'unavailable' };
        continue;
      }
      
      // Extract data
      const title = product.title ? product.title.substring(0, 500) : null;
      
      // Extract primary image
      let imageUrl = null;
      if (product.imagesCSV) {
        const imageCodes = product.imagesCSV.split(',');
        const imageCode = imageCodes[0]?.trim();
        if (imageCode && imageCode.length > 0) {
          // Strip .jpg extension if present (Keepa includes it)
          const cleanCode = imageCode.replace(/\.jpg$/i, '');
          imageUrl = `https://m.media-amazon.com/images/I/${cleanCode}._SL500_.jpg`;
        }
      }
      
      // Extract category (use root category name)
      let category = null;
      if (product.categoryTree && Array.isArray(product.categoryTree) && product.categoryTree.length > 0) {
        // Get root category (first in tree)
        const rootCategory = product.categoryTree[0];
        if (rootCategory && rootCategory.name) {
          category = rootCategory.name;
        }
      }
      
      // Only mark as enriched if we got at least some data
      if (title || imageUrl || category) {
        enrichmentMap[asin] = {
          title,
          image_url: imageUrl,
          category,
          status: 'enriched'
        };
        enriched++;
        console.log(`  ✅ ${asin}: Enriched (title=${!!title}, image=${!!imageUrl}, category=${!!category})`);
      } else {
        enrichmentMap[asin] = { status: 'failed' };
        failed++;
        console.log(`  ❌ ${asin}: No data available`);
      }
    }
    
    // Bulk update database
    console.log(`📝 Batch ${batchNum}: Updating ${Object.keys(enrichmentMap).length} records in database`);
    
    for (const [asin, data] of Object.entries(enrichmentMap)) {
      const updateData = { enrichment_status: data.status };
      
      if (data.title) updateData.title = data.title;
      if (data.image_url) updateData.image_url = data.image_url;
      if (data.category) updateData.category = data.category;
      
      const { error: updateError } = await getSupabase()
        .from('catalog_imports')
        .update(updateData)
        .eq('user_id', userId)
        .eq('asin', asin);
      
      if (updateError) {
        console.error(`  ❌ Failed to update catalog_imports ${asin}:`, updateError.message);
      }
      
      // Also update sourced_products with enriched data
      if (data.status === 'enriched') {
        const sourcedUpdate = {};
        if (data.title) sourcedUpdate.title = data.title;
        if (data.image_url) sourcedUpdate.image_url = data.image_url;
        
        if (Object.keys(sourcedUpdate).length > 0) {
          const { error: sourcedError } = await getSupabase()
            .from('sourced_products')
            .update(sourcedUpdate)
            .eq('user_id', userId)
            .eq('asin', asin);
          
          if (sourcedError) {
            console.error(`  ⚠️ Failed to update sourced_products ${asin}:`, sourcedError.message);
          }
        }
      }
    }
    
    console.log(`✅ Batch ${batchNum}: Complete (enriched=${enriched}, failed=${failed}, tokens=${tokensConsumed})`);
    
    return {
      success: true,
      enriched,
      failed,
      tokensConsumed
    };
    
  } catch (error) {
    console.error(`Batch ${batchNum} error:`, error.message || error);
    return {
      success: false,
      enriched: 0,
      failed: asins.length,
      tokensConsumed: 0
    };
  }
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  console.log('🔧 Process Enrichment Job - Starting');
  
  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      console.error('Invalid JSON body:', e);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }
    
    const { jobId } = body;
    
    if (!jobId) {
      console.error('Missing jobId parameter');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'jobId is required' })
      };
    }
    
    console.log(`📋 Processing enrichment job: ${jobId}`);
    
    // Get job details
    const { data: job, error: jobError } = await getSupabase()
      .from('enrichment_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      console.error('Job not found:', jobError);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Job not found' })
      };
    }
    
    // Check if already processing/completed
    if (job.status === 'completed') {
      console.log('Job already completed');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Job already completed' })
      };
    }
    
    if (job.status === 'processing') {
      console.log('Job already processing (preventing duplicate execution)');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Job already processing' })
      };
    }
    
    // Mark job as processing
    await getSupabase()
      .from('enrichment_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    console.log('✅ Job marked as processing');
    
    // Get ASINs that need enrichment — use stored IDs if available, fall back to pending query
    let catalogQuery = getSupabase()
      .from('catalog_imports')
      .select('id, asin');
    
    if (job.catalog_import_ids && job.catalog_import_ids.length > 0) {
      console.log(`📋 Using ${job.catalog_import_ids.length} stored catalog_import_ids`);
      catalogQuery = catalogQuery.in('id', job.catalog_import_ids);
    } else {
      console.log('⚠️ No stored IDs, falling back to pending query');
      catalogQuery = catalogQuery
        .eq('user_id', job.user_id)
        .eq('enrichment_status', 'pending')
        .limit(job.total_count);
    }
    
    const { data: catalogItems, error: catalogError } = await catalogQuery;
    
    if (catalogError) {
      console.error('Failed to fetch catalog items:', catalogError);
      await getSupabase()
        .from('enrichment_jobs')
        .update({
          status: 'failed',
          error_message: `Failed to fetch catalog items: ${catalogError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch catalog items' })
      };
    }
    
    if (!catalogItems || catalogItems.length === 0) {
      console.log('No items to enrich (all already processed)');
      await getSupabase()
        .from('enrichment_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No items to enrich' })
      };
    }
    
    console.log(`📦 Found ${catalogItems.length} items to enrich`);
    
    // Process in batches of 100 (Keepa API limit), 3 concurrent batches
    const BATCH_SIZE = 100;
    const CONCURRENCY = 3;
    const asins = catalogItems.map(item => item.asin);
    
    const batches = [];
    for (let i = 0; i < asins.length; i += BATCH_SIZE) {
      batches.push(asins.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`🔄 Processing ${batches.length} batches with concurrency ${CONCURRENCY}`);
    
    let totalEnriched = 0;
    let totalFailed = 0;
    let totalTokens = 0;
    
    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const batchGroup = batches.slice(i, i + CONCURRENCY);
      const batchNum = i + 1;
      
      console.log(`\n📋 Processing batch group ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(batches.length / CONCURRENCY)}`);
      
      // Process batches concurrently
      const results = await Promise.all(
        batchGroup.map((batch, idx) => 
          processBatch(batch, job.user_id, jobId, batchNum + idx, batches.length)
        )
      );
      
      // Aggregate results
      for (const result of results) {
        totalEnriched += result.enriched;
        totalFailed += result.failed;
        totalTokens += result.tokensConsumed;
      }
      
      // Update job progress
      await getSupabase()
        .from('enrichment_jobs')
        .update({
          processed_count: Math.min((i + CONCURRENCY) * BATCH_SIZE, asins.length),
          enriched_count: totalEnriched,
          failed_count: totalFailed,
          tokens_consumed: totalTokens,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      
      console.log(`📊 Progress: ${totalEnriched} enriched, ${totalFailed} failed, ${totalTokens} tokens`);
    }
    
    // Mark job as completed
    await getSupabase()
      .from('enrichment_jobs')
      .update({
        status: 'completed',
        processed_count: asins.length,
        enriched_count: totalEnriched,
        failed_count: totalFailed,
        tokens_consumed: totalTokens,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    console.log(`✅ Job complete: ${totalEnriched}/${asins.length} enriched, ${totalTokens} tokens consumed`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        jobId,
        total: asins.length,
        enriched: totalEnriched,
        failed: totalFailed,
        tokensConsumed: totalTokens
      })
    };
    
  } catch (error) {
    console.error('Worker error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error.message || 'Internal server error'
      })
    };
  }
};
