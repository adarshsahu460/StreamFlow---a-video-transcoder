const {S3Client,GetObjectCommand, PutObjectCommand} = require('@aws-sdk/client-s3')
const fs = require('node:fs/promises')
const path = require('node:path')
const fsOld = require('node:fs')
const ffmpeg = require('fluent-ffmpeg')

const RESOLUTIONS = [
    {name : "360p", width:480, height:360},
    {name : "480p", width:858, height:480},
    {name : "720p", width:1280, height:720},
]

const s3Client = new S3Client({
    region : process.env.AWS_REGION ,
    credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY ,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
})

const BUCKET_NAME = process.env.BUCKET_NAME
const KEY = process.env.KEY

async function init() {
    const command = new GetObjectCommand({
        Bucket:BUCKET_NAME,
        Key:KEY
    })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const prefix = `processed-videos-${timestamp}/`
    const result = await s3Client.send(command)
    const originalFilePath = 'original-video.mp4'
    await fs.writeFile(originalFilePath, result.Body)
    const originalVideoPath = path.resolve(originalFilePath)

    const promises = RESOLUTIONS.map(resolution => {
        const output = `video-${resolution.name}.mp4`
        return new Promise(resolve => {
            ffmpeg(originalVideoPath).output(output).withVideoCodec("libx264").withAudioCodec("aac")
            .withSize(`${resolution.width}x${resolution.height}`)
            .on('start',()=> console.log("Start"+`${resolution.width}x${resolution.height}`))
            .on('end',async ()=> {
                const putCommand = new PutObjectCommand({
                    Bucket:'production-videos.adarshsahu.dev',
                    Key: prefix+output,
                    Body : fsOld.createReadStream(path.resolve(output))
                })
                await s3Client.send(putCommand)
                resolve(output)
            })
            .format("mp4")
            .run();
        })
    })
    await Promise.all(promises)
}

init();