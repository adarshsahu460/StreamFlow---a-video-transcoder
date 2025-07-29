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
    console.log('🚀 Consumer Lambda triggered');
    console.log(`📥 Received ${event.Records.length} SQS messages`);
    
    // Log each message for debugging
    event.Records.forEach((record, index) => {
        console.log(`📋 Message ${index + 1}:`, {
            messageId: record.messageId,
            receiptHandle: record.receiptHandle?.substring(0, 50) + '...',
            bodySize: record.body?.length || 0,
            attributes: record.attributes
        });
    });
    
    // Process all records in parallel for efficiency
    const processPromises = event.Records.map((record, index) => 
        processMessage(record)
    );
    
    try {
        // Wait for all processing to complete
        // If any message fails, the Lambda will retry the entire batch
        await Promise.all(processPromises);
        
        console.log('✅ Successfully processed all messages');
    } catch (error) {
        console.error('❌ Error processing SQS batch:', {
            totalMessages: event.Records.length,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined
        });
        throw error; // Re-throw to trigger SQS retry
    }
};

async function processMessage(record: SQSRecord): Promise<void> {
    console.log('🔄 Processing SQS message:', {
        messageId: record.messageId,
        receiptHandle: record.receiptHandle?.substring(0, 50) + '...'
    });
    
    try {
        // Parse the SQS message body
        const body = JSON.parse(record.body);
        console.log('📋 Parsed SQS message body:', {
            messageId: record.messageId,
            bodyType: typeof body,
            hasEvent: 'Event' in body,
            eventType: body.Event || 'N/A',
            hasRecords: 'Records' in body,
            recordCount: body.Records?.length || 0
        });
        
        // Check if it's an S3 test event
        if ("Event" in body && body.Event === "s3:TestEvent") {
            console.log("⚠️ S3 Test Event received. Ignoring.");
            return;
        }
        
        const s3Event = body as S3Event;
        
        if (!s3Event.Records || s3Event.Records.length === 0) {
            console.warn('⚠️ No S3 records found in event');
            return;
        }
        
        console.log(`📁 Processing ${s3Event.Records.length} S3 records`);
        
        // Process each S3 record in the event
        for (const [index, s3Record] of s3Event.Records.entries()) {
            console.log(`📄 Processing S3 record ${index + 1}/${s3Event.Records.length}:`, {
                eventName: s3Record.eventName,
                eventSource: s3Record.eventSource,
                eventTime: s3Record.eventTime
            });
            
            const sourceBucket = s3Record.s3.bucket.name;
            const encodedVideoKey = s3Record.s3.object.key;
            const videoKey = decodeURIComponent(encodedVideoKey.replace(/\+/g, ' '));
            
            console.log('📊 S3 object details:', {
                sourceBucket,
                encodedVideoKey,
                decodedVideoKey: videoKey,
                objectSize: s3Record.s3.object.size,
                eventVersion: s3Record.eventVersion
            });
            
            // Validate and sanitize the input
            if (!isValidVideoPath(videoKey)) {
                console.error(`❌ Invalid file path format in key: "${videoKey}". Skipping for security reasons.`);
                continue;
            }
            
            const filename = path.basename(videoKey);
            console.log('🏷️ Extracted filename:', {
                fullPath: videoKey,
                filename,
                hasSeparator: filename.includes(FILENAME_SEPARATOR),
                expectedFormat: 'username###video-name'
            });
            
            if (!filename.includes(FILENAME_SEPARATOR)) {
                console.error(`❌ Invalid filename format: "${filename}". Expected 'username###video-name'.`);
                continue;
            }
            
            // Extract metadata from the filename
            const [username, videoNameWithExt] = filename.split(FILENAME_SEPARATOR);
            const videoNameBase = path.parse(videoNameWithExt).name; // Remove extension
            const timestamp = Date.now();
            const videoId = `${username}###${videoNameBase}-${timestamp}`;
            const outputPrefix = `processed/${videoId}/`;
            
            console.log('🔧 Generated video metadata:', {
                originalFilename: filename,
                username,
                videoNameWithExt,
                videoNameBase,
                timestamp,
                videoId,
                outputPrefix
            });
            
            // Store initial metadata in DynamoDB
            const metadata: VideoMetadata = {
                videoId,
                username,
                title: videoNameBase,
                sourceKey: videoKey,
                sourceBucket,
                status: 'PROCESSING',
                createdAt: new Date().toISOString(),
                outputPrefix
            };
            
            console.log('💾 Storing metadata in DynamoDB:', metadata);
            await storeVideoMetadata(metadata);
            
            // Launch ECS task for video processing
            console.log('🚀 Launching ECS transcoding task');
            await startTranscodingTask(sourceBucket, videoKey, outputPrefix);
            
            console.log(`✅ Successfully processed S3 record ${index + 1}/${s3Event.Records.length} for video: ${videoId}`);
        }
        
        console.log(`✅ Completed processing all S3 records for message: ${record.messageId}`);
    } catch (error) {
        console.error('❌ Error processing SQS message:', {
            messageId: record.messageId,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined
        });
        throw error; // Rethrow to trigger SQS retry
    }
}

async function startTranscodingTask(sourceBucket: string, videoKey: string, outputPrefix: string): Promise<void> {
    console.log('🚀 Starting ECS transcoding task:', {
        sourceBucket,
        videoKey,
        outputPrefix,
        taskDefinition: TASK_DEFINITION,
        cluster: CLUSTER_NAME,
        containerName: CONTAINER_NAME
    });
    
    try {
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
        
        console.log('📋 ECS RunTask command configuration:', {
            taskDefinition: TASK_DEFINITION,
            cluster: CLUSTER_NAME,
            launchType: 'FARGATE',
            containerName: CONTAINER_NAME,
            environment: {
                SOURCE_BUCKET: sourceBucket,
                DESTINATION_BUCKET: DESTINATION_BUCKET,
                VIDEO_KEY: videoKey,
                OUTPUT_PREFIX: outputPrefix,
                VIDEO_TABLE_NAME: VIDEO_TABLE_NAME
            }
        });
        
        const result = await ecsClient.send(runTaskCommand);
        
        console.log('✅ ECS Task started successfully:', {
            videoKey,
            taskArn: result.tasks?.[0]?.taskArn,
            taskDefinitionArn: result.tasks?.[0]?.taskDefinitionArn,
            clusterArn: result.tasks?.[0]?.clusterArn,
            lastStatus: result.tasks?.[0]?.lastStatus,
            desiredStatus: result.tasks?.[0]?.desiredStatus,
            createdAt: result.tasks?.[0]?.createdAt
        });
        
    } catch (error) {
        console.error('❌ Failed to start ECS transcoding task:', {
            sourceBucket,
            videoKey,
            outputPrefix,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            taskDefinition: TASK_DEFINITION,
            cluster: CLUSTER_NAME
        });
        throw error; // Re-throw to propagate the error
    }
}

async function storeVideoMetadata(metadata: VideoMetadata): Promise<void> {
    console.log('💾 Storing video metadata in DynamoDB:', {
        videoId: metadata.videoId,
        tableName: VIDEO_TABLE_NAME,
        status: metadata.status,
        metadata: metadata
    });
    
    try {
        const command = new PutCommand({
            TableName: VIDEO_TABLE_NAME,
            Item: metadata
        });
        
        const result = await docClient.send(command);
        
        console.log('✅ Successfully stored metadata in DynamoDB:', {
            videoId: metadata.videoId,
            tableName: VIDEO_TABLE_NAME,
            status: metadata.status,
            sourceKey: metadata.sourceKey,
            outputPrefix: metadata.outputPrefix,
            result: result
        });
        
    } catch (error) {
        console.error('❌ Failed to store metadata in DynamoDB:', {
            videoId: metadata.videoId,
            tableName: VIDEO_TABLE_NAME,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            metadata: metadata
        });
        throw error; // Re-throw to propagate the error
    }
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
