// Video metadata utilities for DynamoDB operations
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB clients
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Configuration
const VIDEO_TABLE_NAME = process.env.VIDEO_TABLE_NAME || 'VideoMetadata';

/**
 * Updates the video metadata in DynamoDB
 * @param {string} videoId - The video ID
 * @param {Object} updates - The fields to update
 */
async function updateVideoMetadata(videoId, updates) {
  try {
    console.log(`Updating DynamoDB metadata for ${videoId} with:`, updates);
    
    const command = new UpdateCommand({
      TableName: VIDEO_TABLE_NAME,
      Key: {
        videoId
      },
      UpdateExpression: buildUpdateExpression(updates),
      ExpressionAttributeValues: buildExpressionAttributeValues(updates),
      ReturnValues: 'UPDATED_NEW'
    });

    const result = await docClient.send(command);
    console.log(`✅ Updated DynamoDB metadata for ${videoId}`, result.Attributes);
    return result.Attributes;
  } catch (error) {
    console.error(`Failed to update DynamoDB for ${videoId}:`, error);
    // Don't rethrow - we don't want the entire job to fail if DB update fails
  }
}

/**
 * Gets video metadata from DynamoDB
 * @param {string} videoId - The video ID
 */
async function getVideoMetadata(videoId) {
  try {
    const command = new GetCommand({
      TableName: VIDEO_TABLE_NAME,
      Key: { videoId }
    });

    const response = await docClient.send(command);
    return response.Item;
  } catch (error) {
    console.error(`Failed to get metadata for ${videoId} from DynamoDB:`, error);
    return null;
  }
}

/**
 * Builds the UpdateExpression for DynamoDB
 */
function buildUpdateExpression(updates) {
  const expressions = [];
  let expression = 'SET ';

  Object.keys(updates).forEach(key => {
    expressions.push(`${key} = :${key}`);
  });

  expression += expressions.join(', ');
  return expression;
}

/**
 * Builds the ExpressionAttributeValues for DynamoDB
 */
function buildExpressionAttributeValues(updates) {
  const values = {};

  Object.entries(updates).forEach(([key, value]) => {
    values[`:${key}`] = value;
  });

  return values;
}

module.exports = {
  updateVideoMetadata,
  getVideoMetadata
};
