import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import type { S3Event } from 'aws-lambda';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: '../.env' });

const sqsClient = new SQSClient({
    region: process.env.AWS_REGION as string,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY as string,
        secretAccessKey: process.env.AWS_SECRET_KEY as string
    }
});

const ecsClient = new ECSClient({
    region: process.env.AWS_REGION as string,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY as string,
        secretAccessKey: process.env.AWS_SECRET_KEY as string
    }
});

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;
const FILENAME_SEPARATOR = '###';

if (!DESTINATION_BUCKET) {
    console.error("FATAL: DESTINATION_BUCKET must be set in your .env file.");
    process.exit(1);
}


async function init() {
    console.log("🚀 Poller service started. Waiting for messages...");

    const receiveCommand = new ReceiveMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 60
    });

    while (true) {
        try {
            const { Messages } = await sqsClient.send(receiveCommand);
            if (!Messages || Messages.length === 0) continue;

            for (const message of Messages) {
                const receiptHandle = message.ReceiptHandle!;
                
                if (!message.Body) {
                    console.log("Message with empty body received, deleting.");
                    await deleteMessage(receiptHandle);
                    continue;
                }

                const event = JSON.parse(message.Body) as S3Event;

                if ("Event" in event && event.Event === "s3:TestEvent") {
                    console.log("S3 Test Event received. Deleting message.");
                    await deleteMessage(receiptHandle);
                    continue;
                }

                for (const record of event.Records) {
                    const sourceBucket = record.s3.bucket.name;
                    const videoKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
                    const filename = path.basename(videoKey);
                    if (!filename.includes(FILENAME_SEPARATOR)) {
                        console.error(`Invalid filename format: "${filename}". Expected 'username###video-name'. Deleting message.`);
                        await deleteMessage(receiptHandle);
                        continue;
                    }

                    console.log(`Starting ECS task for ${videoKey}`);

                    const taskDefinition = process.env.TASK_DEFINITION;
                    const containerName = process.env.CONTAINER_NAME;
                    const cluster = process.env.CLUSTER_NAME;   

                    const runTaskCommand = new RunTaskCommand({
                        taskDefinition,
                        cluster,
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
                                name: containerName,
                                environment: [
                                    { name: "SOURCE_BUCKET", value: sourceBucket },
                                    { name: "DESTINATION_BUCKET", value: DESTINATION_BUCKET! },
                                    { name: "VIDEO_KEY", value: videoKey },
                                ]
                            }]
                        }
                    });

                    await ecsClient.send(runTaskCommand);
                    console.log(`✅ ECS Task started for ${videoKey}`);
                    await deleteMessage(receiptHandle);
                }
            }
        }catch (err) {
            console.error("An error occurred in the main loop:", err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function deleteMessage(receiptHandle: string) {
    await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: receiptHandle
    }));
}

init();
