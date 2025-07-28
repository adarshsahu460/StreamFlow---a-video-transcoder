import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// Initialize clients
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Configuration
const VIDEO_TABLE_NAME = process.env.VIDEO_TABLE_NAME || 'VideoMetadata';
const SOURCE_BUCKET = process.env.SOURCE_BUCKET || '';
const MAX_VIDEOS = 100;
const FILENAME_SEPARATOR = '###';

// Common headers for CORS
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
  'Content-Type': 'application/json'
};

export const getVideos: APIGatewayProxyHandler = async (event) => {
  try {
    // Check if we should include pending videos
    const queryParams = event.queryStringParameters || {};
    const includePending = queryParams.includePending === 'true';
    
    let filterExpression = 'attribute_exists(videoId)';
    let expressionAttributeValues = {};
    
    // Only filter by COMPLETED status if not including pending videos
    if (!includePending) {
      filterExpression = 'status = :status';
      expressionAttributeValues = {
        ':status': 'COMPLETED'
      };
    }

    const scanCommand = new ScanCommand({
      TableName: VIDEO_TABLE_NAME,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: MAX_VIDEOS
    });

    const response = await docClient.send(scanCommand);
    
    // Sort by createdAt in descending order (newest first)
    const videos = response.Items?.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ) || [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        videos: videos.map(video => ({
          id: video.videoId,
          title: video.title,
          username: video.username,
          thumbnailUrl: video.thumbnailUrl || '',
          playbackUrl: video.masterPlaylistUrl || '',
          status: video.status || 'PENDING',
          createdAt: video.createdAt
        }))
      })
    };
  } catch (error) {
    console.error('Error fetching videos:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error fetching videos' })
    };
  }
};

export const getVideo: APIGatewayProxyHandler = async (event) => {
  try {
    const videoId = event.pathParameters?.id;
    
    if (!videoId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Video ID is required' })
      };
    }

    const getCommand = new GetCommand({
      TableName: VIDEO_TABLE_NAME,
      Key: { videoId }
    });

    const response = await docClient.send(getCommand);
    const video = response.Item;

    if (!video) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Video not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: video.videoId,
        title: video.title,
        username: video.username,
        thumbnailUrl: video.thumbnailUrl,
        playbackUrl: video.masterPlaylistUrl,
        createdAt: video.createdAt
      })
    };
  } catch (error) {
    console.error('Error fetching video:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error fetching video' })
    };
  }
};

export const getUploadUrl: APIGatewayProxyHandler = async (event) => {
  try {
    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const { title, username, fileType } = body;
    
    // Validate required fields
    if (!title || !username || !fileType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Missing required fields. Please provide title, username, and fileType.' 
        })
      };
    }
    
    // Validate file type (only allow video types)
    if (!fileType.startsWith('video/')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Only video files are allowed.' })
      };
    }
    
    // Create a sanitized filename from the title
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .substring(0, 50);
    
    // Generate a unique video ID that will be used in S3 and DynamoDB
    const timestamp = Date.now();
    const videoId = `${username}${FILENAME_SEPARATOR}${sanitizedTitle}-${timestamp}`;
    
    // The S3 key includes the naming pattern needed for the processor
    const s3Key = `${videoId}${getFileExtensionFromMimeType(fileType)}`;
    
    // Create presigned URL for uploading
    const command = new PutObjectCommand({
      Bucket: SOURCE_BUCKET,
      Key: s3Key,
      ContentType: fileType
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    // Store initial metadata in DynamoDB
    await storeInitialVideoMetadata({
      videoId,
      title,
      username,
      status: 'PENDING',
      sourceKey: s3Key,
      createdAt: new Date().toISOString()
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl: presignedUrl,
        videoId,
        key: s3Key
      })
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error generating upload URL' })
    };
  }
};

/**
 * Video metadata interface
 */
interface VideoMetadata {
  videoId: string;
  title: string;
  username: string;
  status: string;
  sourceKey: string;
  createdAt: string;
  thumbnailUrl?: string;
  masterPlaylistUrl?: string;
}

/**
 * Stores initial video metadata in DynamoDB
 */
async function storeInitialVideoMetadata(metadata: VideoMetadata) {
  const command = new PutCommand({
    TableName: VIDEO_TABLE_NAME,
    Item: metadata
  });
  
  await docClient.send(command);
  console.log(`✅ Stored initial metadata for ${metadata.videoId} in DynamoDB`);
}

/**
 * Maps MIME types to file extensions
 */
function getFileExtensionFromMimeType(mimeType) {
  const mimeToExtension = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv'
  };
  
  return mimeToExtension[mimeType] || '.mp4';
}
