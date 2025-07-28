import { SQSHandler, SQSEvent, SQSRecord, S3Event } from 'aws-lambda';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import path from 'path';

// Initialize clients - will automatically use the Lambda execution role
const ecsClient = new ECSClient({ region: process.env.AWS_REGION });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Configuration from environment variables
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;
const FILENAME_SEPARATOR = '###';
const TASK_DEFINITION = process.env.TASK_DEFINITION;
const CONTAINER_NAME = process.env.CONTAINER_NAME;
const CLUSTER_NAME = process.env.CLUSTER_NAME;
const VIDEO_TABLE_NAME = process.env.VIDEO_TABLE_NAME || 'VideoMetadata';

// Lambda handler function - processes SQS events in batches
export const handler: SQSHandler = async (event: SQSEvent) => {
    console.log(`Received ${event.Records.length} messages`);
    
    // Process all records in parallel for efficiency
    const processPromises = event.Records.map(record => processMessage(record));
    
    // Wait for all processing to complete
    // If any message fails, the Lambda will retry the entire batch
    await Promise.all(processPromises);
    
    console.log('Successfully processed all messages');
};

async function processMessage(record: SQSRecord): Promise<void> {
    try {
        // Parse the SQS message body
        const body = JSON.parse(record.body);
        
        // Check if it's an S3 test event
        if ("Event" in body && body.Event === "s3:TestEvent") {
            console.log("S3 Test Event received. Ignoring.");
            return;
        }
        
        const s3Event = body as S3Event;
        
        // Process each S3 record in the event
        for (const s3Record of s3Event.Records) {
            const sourceBucket = s3Record.s3.bucket.name;
            const videoKey = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
            
            // Validate and sanitize the input
            if (!isValidVideoPath(videoKey)) {
                console.error(`Invalid file path format in key: "${videoKey}". Skipping for security reasons.`);
                continue;
            }
            
            const filename = path.basename(videoKey);
            if (!filename.includes(FILENAME_SEPARATOR)) {
                console.error(`Invalid filename format: "${filename}". Expected 'username###video-name'.`);
                continue;
            }
            
            // Extract metadata from the filename
            const [username, videoName] = filename.split(FILENAME_SEPARATOR);
            const videoId = `${username}###${videoName}-${Date.now()}`;
            const outputPrefix = `processed/${videoId}/`;
            
            // Store initial metadata in DynamoDB
            await storeVideoMetadata({
                videoId,
                username,
                title: videoName,
                sourceKey: videoKey,
                sourceBucket,
                status: 'PROCESSING',
                createdAt: new Date().toISOString(),
                outputPrefix
            });
            
            // Launch ECS task for video processing
            await startTranscodingTask(sourceBucket, videoKey, outputPrefix);
        }
    } catch (error) {
        console.error('Error processing message:', error);
        throw error; // Rethrow to trigger SQS retry
    }
}

async function startTranscodingTask(sourceBucket: string, videoKey: string, outputPrefix: string): Promise<void> {
    console.log(`Starting ECS task for ${videoKey}`);
    
    const runTaskCommand = new RunTaskCommand({
        taskDefinition: TASK_DEFINITION,
        cluster: CLUSTER_NAME,
        launchType: 'FARGATE',
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                securityGroups: ['sg-07225aa3caaa88140'],
                subnets: [
                    'subnet-03488bb14986cec1a',
                    'subnet-0966454fe401d47f9',
                    'subnet-0cb3d8d27f784aee2'
                ]
            }
        },
        overrides: {
            containerOverrides: [{
                name: CONTAINER_NAME,
                environment: [
                    { name: "SOURCE_BUCKET", value: sourceBucket },
                    { name: "DESTINATION_BUCKET", value: DESTINATION_BUCKET! },
                    { name: "VIDEO_KEY", value: videoKey },
                    { name: "OUTPUT_PREFIX", value: outputPrefix },
                    { name: "VIDEO_TABLE_NAME", value: VIDEO_TABLE_NAME }
                ]
            }]
        }
    });
    
    await ecsClient.send(runTaskCommand);
    console.log(`✅ ECS Task started for ${videoKey}`);
}

async function storeVideoMetadata(metadata: VideoMetadata): Promise<void> {
    const command = new PutCommand({
        TableName: VIDEO_TABLE_NAME,
        Item: metadata
    });
    
    await docClient.send(command);
    console.log(`✅ Stored metadata for ${metadata.videoId} in DynamoDB`);
}

/**
 * Validates that a video path is safe and doesn't contain any potentially harmful characters
 * that could be used for path traversal or command injection
 */
function isValidVideoPath(path: string): boolean {
    // Check for null bytes, control characters, or path traversal attempts
    if (/[\x00-\x1F]|\.\.\/|\.\.\\/i.test(path)) {
        return false;
    }
    
    // Allow only alphanumeric characters, hyphens, underscores, periods, and forward slashes
    // Customize this regex based on your specific filename requirements
    return /^[a-zA-Z0-9\-_\/.#]+$/.test(path);
}

// Type definition for video metadata
interface VideoMetadata {
    videoId: string;
    username: string;
    title: string;
    sourceKey: string;
    sourceBucket: string;
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
    createdAt: string;
    outputPrefix: string;
    thumbnailUrl?: string;
    masterPlaylistUrl?: string;
    errorMessage?: string;
}
