const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createReadStream } = require('node:fs');
const ffmpeg = require('fluent-ffmpeg');
const { updateVideoMetadata } = require('./db-utils');

// When deployed to ECS, the service will use the IAM role assigned to the task
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const SOURCE_BUCKET = process.env.SOURCE_BUCKET; 
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET; 
const VIDEO_KEY = process.env.VIDEO_KEY;
const OUTPUT_PREFIX = process.env.OUTPUT_PREFIX || `processed/${path.parse(VIDEO_KEY).name}-${Date.now()}/`;

const RESOLUTIONS = [
    { name: '360p', width: 640, height: 360, bv: '800k', ba: '96k' },
    { name: '480p', width: 854, height: 480, bv: '1400k', ba: '128k' },
    { name: '720p', width: 1280, height: 720, bv: '2800k', ba: '128k' },
];

const LOCAL_SOURCE_VIDEO = path.resolve('./source.mp4');
const LOCAL_OUTPUT_DIR = path.resolve('./output');

async function main() {
    const videoId = path.parse(VIDEO_KEY).name;
    const outputPrefix = OUTPUT_PREFIX;

    console.log('🚀 Starting HLS transcoding job:', {
        videoId,
        sourceBucket: SOURCE_BUCKET,
        destinationBucket: DESTINATION_BUCKET,
        videoKey: VIDEO_KEY,
        outputPrefix,
        resolutions: RESOLUTIONS,
        environment: {
            AWS_REGION: process.env.AWS_REGION,
            VIDEO_TABLE_NAME: process.env.VIDEO_TABLE_NAME
        }
    });

    try {
        console.log('📁 Creating local output directory...');
        await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });
        console.log('✅ Local output directory created:', LOCAL_OUTPUT_DIR);
        
        console.log('⬇️ Starting video download from S3...');
        await downloadFile(SOURCE_BUCKET, VIDEO_KEY, LOCAL_SOURCE_VIDEO);
        console.log('✅ Source video downloaded successfully:', {
            sourcePath: `s3://${SOURCE_BUCKET}/${VIDEO_KEY}`,
            localPath: LOCAL_SOURCE_VIDEO
        });

        console.log('🎬 Starting HLS transcoding for all resolutions...');
        const hlsPromises = RESOLUTIONS.map(res => {
            console.log(`🔄 Queuing transcoding for ${res.name} (${res.width}x${res.height})`);
            return transcodeToHLS(res, LOCAL_OUTPUT_DIR);
        });
        
        console.log('🖼️ Starting sprite sheet generation...');
        const spritePromise = generateSpriteSheet(LOCAL_OUTPUT_DIR);
        
        await Promise.all([...hlsPromises, spritePromise]);
        console.log('✅ All HLS renditions and sprites created locally');

        console.log('📝 Creating master M3U8 playlist...');
        await createMasterPlaylist(RESOLUTIONS, LOCAL_OUTPUT_DIR);
        console.log('✅ Master M3U8 playlist created');

        console.log('⬆️ Starting upload to S3...');
        await uploadDirectoryToS3(LOCAL_OUTPUT_DIR, DESTINATION_BUCKET, outputPrefix);
        console.log(`✅ All assets uploaded to s3://${DESTINATION_BUCKET}/${outputPrefix}`);

        // Extract video thumbnail URL (first frame from sprite) - Use path-style URLs to avoid SSL issues
        const thumbnailUrl = `https://s3.ap-south-1.amazonaws.com/${DESTINATION_BUCKET}/${outputPrefix}sprite.jpg#xywh=0,0,160,90`;
        const masterPlaylistUrl = `https://s3.ap-south-1.amazonaws.com/${DESTINATION_BUCKET}/${outputPrefix}master.m3u8`;
        
        console.log('📊 Generated final URLs:', {
            thumbnailUrl,
            masterPlaylistUrl,
            videoId
        });
        
        console.log('💾 Updating DynamoDB with completion status...');
        // Update DynamoDB with completion status and URLs
        await updateVideoMetadata(videoId, {
            status: 'COMPLETED',
            thumbnailUrl,
            masterPlaylistUrl,
            completedAt: new Date().toISOString()
        });
        
        console.log('📄 Creating completion manifest...');
        await createAndUploadManifest(outputPrefix, 'COMPLETED', null, thumbnailUrl, masterPlaylistUrl);
        console.log('✅ Completion manifest uploaded and DynamoDB updated');
        
        console.log('🎉 Video processing completed successfully!', {
            videoId,
            outputPrefix,
            thumbnailUrl,
            masterPlaylistUrl
        });

    } catch (error) {
        console.error(`❌ Job failed for ${VIDEO_KEY}:`, {
            videoId,
            error: error.message,
            errorStack: error.stack,
            outputPrefix,
            sourceBucket: SOURCE_BUCKET,
            destinationBucket: DESTINATION_BUCKET
        });
        
        console.log('💾 Updating DynamoDB with failure status...');
        // Update DynamoDB with failure status
        await updateVideoMetadata(videoId, {
            status: 'FAILED',
            errorMessage: error.message,
            completedAt: new Date().toISOString()
        });
        
        console.log('📄 Creating failure manifest...');
        await createAndUploadManifest(outputPrefix, 'FAILED', error.message);
        
        console.error('❌ Video processing failed completely');
        throw error;
        
    } finally {
        console.log('🧹 Starting cleanup of local files...');
        try {
            await fs.rm(LOCAL_OUTPUT_DIR, { recursive: true, force: true });
            console.log('✅ Cleaned up output directory:', LOCAL_OUTPUT_DIR);
        } catch (cleanupError) {
            console.warn('⚠️ Failed to cleanup output directory:', cleanupError.message);
        }
        
        try {
            await fs.rm(LOCAL_SOURCE_VIDEO, { force: true });
            console.log('✅ Cleaned up source video file:', LOCAL_SOURCE_VIDEO);
        } catch (cleanupError) {
            console.warn('⚠️ Failed to cleanup source video file:', cleanupError.message);
        }
        
        console.log('🧹 Cleanup completed');
    }
}

async function downloadFile(bucket, key, downloadPath) {
    console.log('⬇️ Starting file download from S3:', {
        bucket,
        key,
        downloadPath,
        s3Url: `s3://${bucket}/${key}`
    });
    
    try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        
        console.log('📡 Sending GetObject command to S3...');
        const { Body, ContentLength, ContentType } = await s3Client.send(command);
        
        console.log('📊 S3 object metadata:', {
            contentLength: ContentLength,
            contentType: ContentType,
            sizeInMB: ContentLength ? (ContentLength / (1024 * 1024)).toFixed(2) : 'Unknown'
        });
        
        console.log('💾 Writing file to local storage...');
        await fs.writeFile(downloadPath, Body);
        
        console.log('✅ File download completed successfully:', {
            bucket,
            key,
            downloadPath,
            sizeInMB: ContentLength ? (ContentLength / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown size'
        });
        
    } catch (error) {
        console.error('❌ Failed to download file from S3:', {
            bucket,
            key,
            downloadPath,
            error: error.message,
            errorStack: error.stack
        });
        throw error;
    }
}

function transcodeToHLS(resolution, outputDir) {
    return new Promise((resolve, reject) => {
        const resolutionDir = path.join(outputDir, resolution.name);
        const outputPath = path.join(resolutionDir, 'playlist.m3u8');
        
        console.log(`🎬 Starting HLS transcode for ${resolution.name}:`, {
            resolution: resolution,
            resolutionDir,
            outputPath,
            inputFile: LOCAL_SOURCE_VIDEO
        });

        // Create the resolution directory
        fs.mkdir(resolutionDir, { recursive: true }).then(() => {
            console.log(`📁 Created directory for ${resolution.name}:`, resolutionDir);
            
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
                .on('start', (commandLine) => {
                    console.log(`🚀 FFmpeg command started for ${resolution.name}:`, {
                        resolution: resolution.name,
                        commandLine: commandLine
                    });
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        console.log(`⏳ ${resolution.name} transcode progress: ${Math.round(progress.percent)}%`, {
                            frames: progress.frames,
                            currentFps: progress.currentFps,
                            currentKbps: progress.currentKbps,
                            targetSize: progress.targetSize,
                            timemark: progress.timemark
                        });
                    }
                })
                .on('end', () => {
                    console.log(`✅ Finished HLS transcode for ${resolution.name}:`, {
                        resolution: resolution.name,
                        outputPath,
                        resolutionDir
                    });
                    resolve();
                })
                .on('error', (err) => {
                    console.error(`❌ FFmpeg error for ${resolution.name}:`, {
                        resolution: resolution.name,
                        error: err.message,
                        errorStack: err.stack,
                        outputPath,
                        inputFile: LOCAL_SOURCE_VIDEO
                    });
                    reject(new Error(`FFmpeg error for ${resolution.name}: ${err.message}`));
                })
                .run();
        }).catch(reject);
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
                ACL: 'public-read', // Add public-read ACL to make files publicly accessible
            }));
        });

    await Promise.all(uploadPromises);
}

async function createAndUploadManifest(prefix, status, errorMessage = null, thumbnailUrl = null, masterPlaylistUrl = null) {
    const manifestContent = {
        status: status,
        sourceVideo: `s3://${SOURCE_BUCKET}/${VIDEO_KEY}`,
        outputPrefix: prefix,
        masterPlaylist: status === 'COMPLETED' ? `${prefix}master.m3u8` : null,
        thumbnailUrl: thumbnailUrl,
        masterPlaylistUrl: masterPlaylistUrl,
        timestamp: new Date().toISOString(),
        error: errorMessage
    };

    const command = new PutObjectCommand({
        Bucket: DESTINATION_BUCKET,
        Key: `${prefix}manifest.json`,
        Body: JSON.stringify(manifestContent, null, 2), 
        ContentType: 'application/json',
        ACL: 'public-read' // Add public-read ACL
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
