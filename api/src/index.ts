import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB clients
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Configuration
const VIDEO_TABLE_NAME = process.env.VIDEO_TABLE_NAME || 'VideoMetadata';
const MAX_VIDEOS = 100;

// Common headers for CORS
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

export const getVideos: APIGatewayProxyHandler = async () => {
  try {
    const scanCommand = new ScanCommand({
      TableName: VIDEO_TABLE_NAME,
      FilterExpression: 'status = :status',
      ExpressionAttributeValues: {
        ':status': 'COMPLETED'
      },
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
          thumbnailUrl: video.thumbnailUrl,
          playbackUrl: video.masterPlaylistUrl,
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
