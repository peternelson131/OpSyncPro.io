/**
 * Video Storage Helper
 * 
 * Provides a unified interface for downloading videos from multiple storage sources.
 * Priority chain:
 * 1. social_ready_url (already transcoded in Supabase Storage)
 * 2. storage_url (original in Supabase Storage)
 * 3. onedrive_file_id (legacy OneDrive fallback)
 * 
 * Usage:
 *   const { getVideoBuffer, getVideoUrl } = require('./utils/video-storage');
 *   const buffer = await getVideoBuffer(video, userId);
 */

const { getValidAccessToken } = require('./onedrive-api');

/**
 * Get video as a Buffer for processing/uploading
 * @param {Object} video - Video record from database
 * @param {string} userId - User ID (needed for OneDrive fallback)
 * @returns {Promise<Buffer>} - Video file as Buffer
 */
async function getVideoBuffer(video, userId) {
  const url = await getVideoUrl(video, userId);
  
  console.log(`📥 Downloading video from: ${url.substring(0, 50)}...`);
  
  // Download the video
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download video: HTTP ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get video URL (without downloading)
 * @param {Object} video - Video record from database
 * @param {string} userId - User ID (needed for OneDrive fallback)
 * @returns {Promise<string>} - Video URL
 */
async function getVideoUrl(video, userId) {
  // PRIORITY 1: Social-ready transcoded version (best quality, already optimized)
  if (video.social_ready_url) {
    console.log('✅ Using social_ready_url (transcoded version)');
    return video.social_ready_url;
  }
  
  // PRIORITY 2: Original in Supabase Storage
  if (video.storage_url) {
    console.log('✅ Using storage_url (Supabase Storage)');
    return video.storage_url;
  }
  
  // PRIORITY 3: Legacy OneDrive fallback
  if (video.onedrive_file_id) {
    console.log('⚠️  Using OneDrive fallback (legacy)');
    
    const { accessToken } = await getValidAccessToken(userId);
    
    // Get download URL from Microsoft Graph API
    const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}`;
    const response = await fetch(graphUrl, {
      headers: { 
        'Authorization': `Bearer ${accessToken}` 
      }
    });
    
    if (!response.ok) {
      throw new Error(`OneDrive API error: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data['@microsoft.graph.downloadUrl']) {
      throw new Error('OneDrive download URL not available');
    }
    
    return data['@microsoft.graph.downloadUrl'];
  }
  
  // PRIORITY 4: No storage location found
  throw new Error('No video storage location found (checked: social_ready_url, storage_url, onedrive_file_id)');
}

/**
 * Get video metadata (URL + size) without downloading
 * @param {Object} video - Video record from database
 * @param {string} userId - User ID
 * @returns {Promise<{url: string, size: number|null, source: string}>}
 */
async function getVideoMetadata(video, userId) {
  let source = 'unknown';
  let url = null;
  
  if (video.social_ready_url) {
    url = video.social_ready_url;
    source = 'social_ready';
  } else if (video.storage_url) {
    url = video.storage_url;
    source = 'supabase_storage';
  } else if (video.onedrive_file_id) {
    url = await getVideoUrl(video, userId);
    source = 'onedrive';
  } else {
    throw new Error('No video storage location found');
  }
  
  return {
    url,
    size: video.file_size || null,
    source
  };
}

module.exports = {
  getVideoBuffer,
  getVideoUrl,
  getVideoMetadata
};
