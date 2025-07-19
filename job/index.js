const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createReadStream } = require('node:fs');
const ffmpeg = require('fluent-ffmpeg');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const SOURCE_BUCKET = process.env.SOURCE_BUCKET; 
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET; 
const VIDEO_KEY = process.env.VIDEO_KEY;

const RESOLUTIONS = [
    { name: '360p', width: 640, height: 360, bv: '800k', ba: '96k' },
    { name: '480p', width: 854, height: 480, bv: '1400k', ba: '128k' },
    { name: '720p', width: 1280, height: 720, bv: '2800k', ba: '128k' },
];

const LOCAL_SOURCE_VIDEO = path.resolve('./source.mp4');
const LOCAL_OUTPUT_DIR = path.resolve('./output');

async function main() {
    const videoId = path.parse(VIDEO_KEY).name;
    const outputPrefix = `processed/${videoId}-${Date.now()}/`;

    try {
        console.log(`🚀 Starting HLS job for s3://${SOURCE_BUCKET}/${VIDEO_KEY}`);
        await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });
        
        await downloadFile(SOURCE_BUCKET, VIDEO_KEY, LOCAL_SOURCE_VIDEO);
        console.log('✅ Source file downloaded.');

        const hlsPromises = RESOLUTIONS.map(res => 
            transcodeToHLS(res, LOCAL_OUTPUT_DIR)
        );
        const spritePromise = generateSpriteSheet(LOCAL_OUTPUT_DIR);
        
        await Promise.all([...hlsPromises, spritePromise]);
        console.log('✅ HLS renditions and sprites created locally.');

        await createMasterPlaylist(RESOLUTIONS, LOCAL_OUTPUT_DIR);
        console.log('✅ Master M3U8 playlist created.');

        await uploadDirectoryToS3(LOCAL_OUTPUT_DIR, DESTINATION_BUCKET, outputPrefix);
        console.log(`✅ All assets uploaded to s3://${DESTINATION_BUCKET}/${outputPrefix}`);

        await createAndUploadManifest(outputPrefix, 'COMPLETED');
        console.log('✅ Completion manifest uploaded.');

    } catch (error) {
        console.error(`❌ Job failed for ${VIDEO_KEY}:`, error);
        await createAndUploadManifest(outputPrefix, 'FAILED', error.message);
        throw error;
        
    } finally {
        console.log('🧹 Cleaning up local files...');
        await fs.rm(LOCAL_OUTPUT_DIR, { recursive: true, force: true });
        await fs.rm(LOCAL_SOURCE_VIDEO, { force: true });
    }
}

async function downloadFile(bucket, key, downloadPath) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const { Body } = await s3Client.send(command);
    await fs.writeFile(downloadPath, Body);
}

function transcodeToHLS(resolution, outputDir) {
    return new Promise((resolve, reject) => {
        const resolutionDir = path.join(outputDir, resolution.name);
        fs.mkdir(resolutionDir, { recursive: true });

        const outputPath = path.join(resolutionDir, 'playlist.m3u8');

        ffmpeg()
            .input(LOCAL_SOURCE_VIDEO)
            .videoFilter(`scale=${resolution.width}:${resolution.height}`)
            .videoCodec('libx264')
            .audioCodec('aac')
            .addOption('-b:v', resolution.bv)
            .addOption('-b:a', resolution.ba)
            .addOption('-f', 'hls')
            .addOption('-hls_time', '10')
            .addOption('-hls_list_size', '0')
            .addOption('-hls_segment_filename', path.join(resolutionDir, 'segment%03d.ts'))
            .output(outputPath)
            .on('start', () => console.log(`Starting HLS transcode for ${resolution.name}...`))
            .on('end', () => {
                console.log(`Finished HLS transcode for ${resolution.name}.`);
                resolve();
            })
            .on('error', (err) => reject(new Error(`FFmpeg error for ${resolution.name}: ${err.message}`)))
            .run();
    });
}

async function createMasterPlaylist(resolutions, outputDir) {
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n';

    resolutions.forEach(res => {
        const bandwidth = parseInt(res.bv.replace('k', '000'), 10) + parseInt(res.ba.replace('k', '000'), 10);
        content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${res.width}x${res.height}\n`;
        content += `${res.name}/playlist.m3u8\n`;
    });

    await fs.writeFile(masterPlaylistPath, content);
}

async function generateSpriteSheet(outputDir) {
    console.log('Generating sprite sheet and VTT file...');
    const localSpritePath = path.join(outputDir, 'sprite.jpg');
    const localVttPath = path.join(outputDir, 'thumbnails.vtt');

    const thumbnailWidth = 160;
    const thumbnailHeight = 90;
    const intervalInSeconds = 5;
    const gridLayout = '10x10';
    const [cols] = gridLayout.split('x').map(Number);

    const videoMetadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(LOCAL_SOURCE_VIDEO, (err, metadata) => {
            if (err) return reject(new Error(`ffprobe error: ${err.message}`));
            resolve(metadata);
        });
    });
    const videoDuration = videoMetadata.format.duration;

    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(LOCAL_SOURCE_VIDEO)
            .videoFilter(`fps=1/${intervalInSeconds},scale=${thumbnailWidth}:-1,tile=${gridLayout}`)
            .addOption('-an') 
            .on('error', (err) => reject(new Error(`Sprite generation error: ${err.message}`)))
            .on('end', () => resolve())
            .output(localSpritePath)
            .run();
    });

    let vttContent = 'WEBVTT\n\n';
    const numberOfTiles = Math.ceil(videoDuration / intervalInSeconds);

    for (let i = 0; i < numberOfTiles; i++) {
        const startTime = i * intervalInSeconds;
        const endTime = Math.min((i + 1) * intervalInSeconds, videoDuration);
        const x = (i % cols) * thumbnailWidth;
        const y = Math.floor(i / cols) * thumbnailHeight;

        vttContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
        vttContent += `sprite.jpg#xywh=${x},${y},${thumbnailWidth},${thumbnailHeight}\n\n`;
    }
    await fs.writeFile(localVttPath, vttContent);

    console.log('✅ Sprite and VTT files created locally.');
}

async function uploadDirectoryToS3(dirPath, bucket, prefix) {
    const files = await fs.readdir(dirPath, { withFileTypes: true, recursive: true });
    const uploadPromises = files
        .filter(file => file.isFile())
        .map(file => {
            const localFilePath = path.join(file.path, file.name);
            const s3Key = path.join(prefix, path.relative(dirPath, localFilePath)).replace(/\\/g, '/');
            
            return s3Client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: createReadStream(localFilePath),
            }));
        });

    await Promise.all(uploadPromises);
}

async function createAndUploadManifest(prefix, status, errorMessage = null) {
    const manifestContent = {
        status: status,
        sourceVideo: `s3://${SOURCE_BUCKET}/${VIDEO_KEY}`,
        outputPrefix: prefix,
        masterPlaylist: status === 'COMPLETED' ? `${prefix}master.m3u8` : null,
        timestamp: new Date().toISOString(),
        error: errorMessage
    };

    const command = new PutObjectCommand({
        Bucket: DESTINATION_BUCKET,
        Key: `${prefix}manifest.json`,
        Body: JSON.stringify(manifestContent, null, 2), 
        ContentType: 'application/json'
    });

    await s3Client.send(command);
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        seconds.toFixed(3).padStart(6, '0')
    ].join(':');
}

main().catch(() => process.exit(1));
