"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: '../.env' });
const sqsClient = new client_sqs_1.SQSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
const ecsClient = new client_ecs_1.ECSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
const dynamoDBClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;
const DYNAMODB_TABLE = process.env.DYNAMODB_WATERMARK_TABLE;
const FILENAME_SEPARATOR = '###';
if (!DESTINATION_BUCKET || !DYNAMODB_TABLE) {
    console.error("FATAL: DESTINATION_BUCKET and DYNAMODB_WATERMARK_TABLE must be set in your .env file.");
    process.exit(1);
}
function getWatermarkKeyForUser(username) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Querying DynamoDB for watermark key for user: ${username}`);
        const command = new client_dynamodb_1.GetItemCommand({
            TableName: DYNAMODB_TABLE,
            Key: {
                username: { S: username }
            }
        });
        try {
            const result = yield dynamoDBClient.send(command);
            if (!result.Item) {
                console.warn(`No watermark entry found for user: ${username}`);
                return null;
            }
            const item = (0, util_dynamodb_1.unmarshall)(result.Item);
            return item.watermark_key || null;
        }
        catch (error) {
            console.error(`DynamoDB query failed for user ${username}:`, error);
            return null;
        }
    });
}
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🚀 Poller service started. Waiting for messages...");
        const receiveCommand = new client_sqs_1.ReceiveMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
            VisibilityTimeout: 60
        });
        while (true) {
            try {
                const { Messages } = yield sqsClient.send(receiveCommand);
                if (!Messages || Messages.length === 0)
                    continue;
                for (const message of Messages) {
                    const receiptHandle = message.ReceiptHandle;
                    if (!message.Body) {
                        console.log("Message with empty body received, deleting.");
                        yield deleteMessage(receiptHandle);
                        continue;
                    }
                    const event = JSON.parse(message.Body);
                    if ("Event" in event && event.Event === "s3:TestEvent") {
                        console.log("S3 Test Event received. Deleting message.");
                        yield deleteMessage(receiptHandle);
                        continue;
                    }
                    for (const record of event.Records) {
                        const sourceBucket = record.s3.bucket.name;
                        const videoKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
                        const filename = path_1.default.basename(videoKey);
                        if (!filename.includes(FILENAME_SEPARATOR)) {
                            console.error(`Invalid filename format: "${filename}". Expected 'username###video-name'. Deleting message.`);
                            yield deleteMessage(receiptHandle);
                            continue;
                        }
                        const [username] = filename.split(FILENAME_SEPARATOR);
                        const watermarkKey = yield getWatermarkKeyForUser(username);
                        if (!watermarkKey) {
                            console.error(`Could not retrieve watermark for user "${username}". The video processing will be skipped. Deleting message.`);
                            yield deleteMessage(receiptHandle);
                            continue;
                        }
                        console.log(`Found watermark key "${watermarkKey}" for user "${username}". Starting ECS task.`);
                        const taskDefinition = process.env.TASK_DEFINITION;
                        const containerName = process.env.CONTAINER_NAME;
                        const cluster = process.env.CLUSTER_NAME;
                        const runTaskCommand = new client_ecs_1.RunTaskCommand({
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
                                            { name: "DESTINATION_BUCKET", value: DESTINATION_BUCKET },
                                            { name: "VIDEO_KEY", value: videoKey },
                                            { name: "WATERMARK_KEY", value: watermarkKey },
                                        ]
                                    }]
                            }
                        });
                        yield ecsClient.send(runTaskCommand);
                        console.log(`✅ ECS Task started for ${videoKey}`);
                        yield deleteMessage(receiptHandle);
                    }
                }
            }
            catch (err) {
                console.error("An error occurred in the main loop:", err);
                yield new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    });
}
function deleteMessage(receiptHandle) {
    return __awaiter(this, void 0, void 0, function* () {
        yield sqsClient.send(new client_sqs_1.DeleteMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            ReceiptHandle: receiptHandle
        }));
    });
}
init();
