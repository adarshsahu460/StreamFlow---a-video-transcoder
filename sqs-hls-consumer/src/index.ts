import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand} from "@aws-sdk/client-sqs";
import type {S3Event} from 'aws-lambda'
import {ECSClient, RunTaskCommand} from '@aws-sdk/client-ecs'
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' })

const client = new SQSClient({
    region : process.env.AWS_REGION as string,
    credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY as string,
        secretAccessKey: process.env.AWS_SECRET_KEY as string
    }
})

const ecsClient = new ECSClient({
    region : process.env.AWS_REGION as string,
    credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY as string,
        secretAccessKey: process.env.AWS_SECRET_KEY as string
    }
})

async function init(){
    const command = new ReceiveMessageCommand({
        QueueUrl:'https://sqs.us-east-1.amazonaws.com/891377095176/TempHLSVideoS3Queue',
        MaxNumberOfMessages : 1,
        WaitTimeSeconds: 10
    })
    while(true){
        const {Messages} = await client.send(command);
        if(!Messages){
            console.log("No messages in queue")
            continue;
        }
        try{
            for (const message of Messages){
                const {MessageId, Body} = message;
                console.log({MessageId, Body});
                if(!Body) continue;
    
                const event = JSON.parse(Body) as S3Event
                
                if("Service" in event && "Event" in event){
                    if(event.Event == "s3:TestEvent"){
                        await client.send(new DeleteMessageCommand({
                            QueueUrl:'https://sqs.us-east-1.amazonaws.com/891377095176/TempRawVideosS3Queue',
                            ReceiptHandle:message.ReceiptHandle
                        }))
                        continue;
                    }
                }

                for(const record of event.Records){
                    const {s3} = record;
                    const {
                        bucket,
                        object : {key}
                    } = s3;
                    // console.log({bucket, key});
                    const runTaskCommand = new RunTaskCommand({
                        taskDefinition:'arn:aws:ecs:us-east-1:891377095176:task-definition/video-transcoder',
                        cluster:'arn:aws:ecs:us-east-1:891377095176:cluster/adarsh_ecs_video_transcoding',
                        launchType:'FARGATE',
                        networkConfiguration:{
                            awsvpcConfiguration:{
                                assignPublicIp:'ENABLED',
                                securityGroups:['sg-02d2527695ae0fc94'],
                                subnets:[
                                    'subnet-06cf8f4515924b4a9',
                                    'subnet-0a6d2879683244fbe',
                                    'subnet-0a3600175d19fa23f'
                                ]
                            }
                        },
                        overrides:{
                            containerOverrides:[
                                {
                                    name : 'hls-transcoder',
                                    environment : [
                                        {name:"BUCKET_NAME", value:bucket.name},
                                        {name:"KEY",value:key},
                                        {name:"AWS_REGION", value:process.env.AWS_REGION as string},
                                        {name:"AWS_ACCESS_KEY", value:process.env.AWS_ACCESS_KEY as string},
                                        {name:"AWS_SECRET_KEY", value:process.env.AWS_SECRET_KEY as string},
                                    ]
                                }
                            ]
                        }
                    })
                    await ecsClient.send(runTaskCommand)
                    await client.send(new DeleteMessageCommand({
                        QueueUrl:'https://sqs.us-east-1.amazonaws.com/891377095176/TempHLSVideoS3Queue',
                        ReceiptHandle:message.ReceiptHandle
                    }))
                }
            }
        }catch(err){
            console.log(err)
        }
    }
}

init();