/**
 * Video Download - Get download URL for a video file from OneDrive
 * 
 * GET /video-download?videoId=xxx
 * Returns a temporary download URL for the video
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const videoId = event.queryStringParameters?.videoId;

    if (!videoId) {
      return errorResponse(400, 'videoId required', headers);
    }

    // Fetch the video record
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (videoError || !video) {
      console.error('Video not found:', videoError);
      return errorResponse(404, 'Video not found', headers);
    }

    let downloadUrl;

    // PRIORITY 1: Check if video is in Supabase Storage (NEW PRIMARY)
    if (video.storage_url) {
      console.log('Video stored in Supabase Storage:', { id: video.id, storage_path: video.storage_path });
      downloadUrl = video.storage_url;
      
      return successResponse({
        success: true,
        downloadUrl,
        filename: video.filename,
        fileSize: video.file_size,
        source: 'supabase-storage'
      }, headers);
    }

    // PRIORITY 2: Fallback to OneDrive for legacy videos
    if (video.onedrive_file_id || video.onedrive_path) {
      console.log('Video stored in OneDrive (legacy):', { 
        id: video.id, 
        onedrive_file_id: video.onedrive_file_id, 
        onedrive_path: video.onedrive_path 
      });
      
      if (video.onedrive_file_id) {
        // Use file ID - this is the OneDrive item ID
        const result = await graphApiRequest(
          userId, 
          `/me/drive/items/${video.onedrive_file_id}`
        );
        
        downloadUrl = result['@microsoft.graph.downloadUrl'];
      } else if (video.onedrive_path) {
        // Use path - need to encode special characters but preserve slashes
        // OneDrive path format: /path/to/file.mp4
        const pathWithoutLeadingSlash = video.onedrive_path.replace(/^\//, '');
        const result = await graphApiRequest(
          userId,
          `/me/drive/root:/${pathWithoutLeadingSlash}`
        );
        
        downloadUrl = result['@microsoft.graph.downloadUrl'];
      }

      if (!downloadUrl) {
        return errorResponse(500, 'Could not generate download URL from OneDrive', headers);
      }
      
      return successResponse({
        success: true,
        downloadUrl,
        filename: video.filename,
        fileSize: video.file_size,
        source: 'onedrive'
      }, headers);
    }

    // PRIORITY 3: No storage location found
    return errorResponse(400, 'Video has no storage location (neither Supabase nor OneDrive)', headers);

  } catch (error) {
    console.error('Error in video-download:', error);
    
    // Check for OneDrive not connected
    if (error.message?.includes('OneDrive not connected')) {
      return errorResponse(400, 'OneDrive not connected. Please connect in Settings.', headers);
    }
    
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
