const {S3Client,GetObjectCommand, PutObjectCommand} = require('@aws-sdk/client-s3')
const fs = require('node:fs/promises')
const path = require('node:path')
const fsOld = require('node:fs')
const ffmpeg = require('fluent-ffmpeg')

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
        Bucket: BUCKET_NAME,
        Key: KEY
    });
    const result = await s3Client.send(command);
    const originalFilePath = 'original-video.mp4';
    await fs.writeFile(originalFilePath, result.Body);
    const originalVideoPath = path.resolve(originalFilePath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const prefix = `processed-videos-${timestamp}/`
    const outputDir = prefix;
    const outputPlaylist = `${outputDir}/playlist.m3u8`;
    const outputSegment = `${outputDir}/segment-%03d.ts`;

    await fs.mkdir(outputDir, { recursive: true });

    await new Promise((resolve, reject) => {
        ffmpeg(originalVideoPath)
            .output(outputPlaylist)
            .withVideoCodec("libx264")
            .withAudioCodec("aac")
            .outputOptions([
                '-hls_time 10', 
                '-hls_list_size 0',
                '-hls_segment_filename', outputSegment
            ])
            .on('end', async () => {
                const files = await fs.readdir(outputDir);
                for (const file of files) {
                    const filePath = path.join(outputDir, file);
                    const putCommand = new PutObjectCommand({
                        Bucket: 'hls.adarshsahu.dev',
                        Key: `${prefix}${file}`,
                        Body: fsOld.createReadStream(filePath)
                    });
                    await s3Client.send(putCommand);
                }
                resolve(outputPlaylist);
            })
            .on('error', (err) => reject(err))
            .format("hls")
            .run();
    });
}

init();