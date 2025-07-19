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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_sqs_1 = require("@aws-sdk/client-sqs");
var client_ecs_1 = require("@aws-sdk/client-ecs");
var client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
var util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
var dotenv_1 = require("dotenv");
var path_1 = require("path");
dotenv_1.default.config({ path: '../.env' });
var sqsClient = new client_sqs_1.SQSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
var ecsClient = new client_ecs_1.ECSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
var dynamoDBClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
var SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
var DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;
var DYNAMODB_TABLE = process.env.DYNAMODB_WATERMARK_TABLE;
var FILENAME_SEPARATOR = '###';
if (!DESTINATION_BUCKET || !DYNAMODB_TABLE) {
    console.error("FATAL: DESTINATION_BUCKET and DYNAMODB_WATERMARK_TABLE must be set in your .env file.");
    process.exit(1);
}
function getWatermarkKeyForUser(username) {
    return __awaiter(this, void 0, void 0, function () {
        var command, result, item, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Querying DynamoDB for watermark key for user: ".concat(username));
                    command = new client_dynamodb_1.GetItemCommand({
                        TableName: DYNAMODB_TABLE,
                        Key: {
                            username: { S: username }
                        }
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, dynamoDBClient.send(command)];
                case 2:
                    result = _a.sent();
                    if (!result.Item) {
                        console.warn("No watermark entry found for user: ".concat(username));
                        return [2 /*return*/, null];
                    }
                    item = (0, util_dynamodb_1.unmarshall)(result.Item);
                    return [2 /*return*/, item.watermark_key || null];
                case 3:
                    error_1 = _a.sent();
                    console.error("DynamoDB query failed for user ".concat(username, ":"), error_1);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function init() {
    return __awaiter(this, void 0, void 0, function () {
        var receiveCommand, Messages, _i, Messages_1, message, receiptHandle, event_1, _a, _b, record, sourceBucket, videoKey, filename, username, watermarkKey, taskDefinition, containerName, cluster, runTaskCommand, err_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log("🚀 Poller service started. Waiting for messages...");
                    receiveCommand = new client_sqs_1.ReceiveMessageCommand({
                        QueueUrl: SQS_QUEUE_URL,
                        MaxNumberOfMessages: 1,
                        WaitTimeSeconds: 20,
                        VisibilityTimeout: 60
                    });
                    _c.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 23];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 20, , 22]);
                    return [4 /*yield*/, sqsClient.send(receiveCommand)];
                case 3:
                    Messages = (_c.sent()).Messages;
                    if (!Messages || Messages.length === 0)
                        return [3 /*break*/, 1];
                    _i = 0, Messages_1 = Messages;
                    _c.label = 4;
                case 4:
                    if (!(_i < Messages_1.length)) return [3 /*break*/, 19];
                    message = Messages_1[_i];
                    receiptHandle = message.ReceiptHandle;
                    if (!!message.Body) return [3 /*break*/, 6];
                    console.log("Message with empty body received, deleting.");
                    return [4 /*yield*/, deleteMessage(receiptHandle)];
                case 5:
                    _c.sent();
                    return [3 /*break*/, 18];
                case 6:
                    event_1 = JSON.parse(message.Body);
                    if (!("Event" in event_1 && event_1.Event === "s3:TestEvent")) return [3 /*break*/, 8];
                    console.log("S3 Test Event received. Deleting message.");
                    return [4 /*yield*/, deleteMessage(receiptHandle)];
                case 7:
                    _c.sent();
                    return [3 /*break*/, 18];
                case 8:
                    _a = 0, _b = event_1.Records;
                    _c.label = 9;
                case 9:
                    if (!(_a < _b.length)) return [3 /*break*/, 18];
                    record = _b[_a];
                    sourceBucket = record.s3.bucket.name;
                    videoKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
                    filename = path_1.default.basename(videoKey);
                    if (!!filename.includes(FILENAME_SEPARATOR)) return [3 /*break*/, 11];
                    console.error("Invalid filename format: \"".concat(filename, "\". Expected 'username###video-name'. Deleting message."));
                    return [4 /*yield*/, deleteMessage(receiptHandle)];
                case 10:
                    _c.sent();
                    return [3 /*break*/, 17];
                case 11:
                    username = filename.split(FILENAME_SEPARATOR)[0];
                    return [4 /*yield*/, getWatermarkKeyForUser(username)];
                case 12:
                    watermarkKey = _c.sent();
                    if (!!watermarkKey) return [3 /*break*/, 14];
                    console.error("Could not retrieve watermark for user \"".concat(username, "\". The video processing will be skipped. Deleting message."));
                    return [4 /*yield*/, deleteMessage(receiptHandle)];
                case 13:
                    _c.sent();
                    return [3 /*break*/, 17];
                case 14:
                    console.log("Found watermark key \"".concat(watermarkKey, "\" for user \"").concat(username, "\". Starting ECS task."));
                    taskDefinition = process.env.TASK_DEFINITION;
                    containerName = process.env.CONTAINER_NAME;
                    cluster = process.env.CLUSTER_NAME;
                    runTaskCommand = new client_ecs_1.RunTaskCommand({
                        taskDefinition: taskDefinition,
                        cluster: cluster,
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
                    return [4 /*yield*/, ecsClient.send(runTaskCommand)];
                case 15:
                    _c.sent();
                    console.log("\u2705 ECS Task started for ".concat(videoKey));
                    return [4 /*yield*/, deleteMessage(receiptHandle)];
                case 16:
                    _c.sent();
                    _c.label = 17;
                case 17:
                    _a++;
                    return [3 /*break*/, 9];
                case 18:
                    _i++;
                    return [3 /*break*/, 4];
                case 19: return [3 /*break*/, 22];
                case 20:
                    err_1 = _c.sent();
                    console.error("An error occurred in the main loop:", err_1);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                case 21:
                    _c.sent();
                    return [3 /*break*/, 22];
                case 22: return [3 /*break*/, 1];
                case 23: return [2 /*return*/];
            }
        });
    });
}
function deleteMessage(receiptHandle) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                        QueueUrl: SQS_QUEUE_URL,
                        ReceiptHandle: receiptHandle
                    }))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
init();
