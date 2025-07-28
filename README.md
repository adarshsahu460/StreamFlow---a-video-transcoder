# StreamFlow

StreamFlow is a serverless video streaming platform that processes uploaded videos into adaptive HLS streams for optimal playback on any device.

## Architecture

The project consists of the following components:

1. **Upload Process**:
   - Videos are uploaded to an S3 bucket
   - S3 events trigger SQS messages
   - A Lambda function processes these messages and starts ECS Fargate tasks

2. **Video Processing**:
   - Containerized Node.js application running in ECS/Fargate
   - Downloads source video from S3
   - Transcodes to multiple HLS renditions (360p, 480p, 720p)
   - Generates thumbnail sprites and VTT files
   - Creates master playlist
   - Uploads all assets to destination S3 bucket
   - Updates DynamoDB with video metadata

3. **API and Frontend**:
   - API Gateway + Lambda functions provide REST API for video management
   - Simple web UI for browsing and playing videos
   - Responsive video player with thumbnail previews

## Infrastructure

The platform is built using AWS services:
- **Storage**: S3, DynamoDB
- **Compute**: Lambda, ECS Fargate
- **Messaging**: SQS
- **API**: API Gateway
- **IAM**: Roles and Policies for secure access

All infrastructure is defined as code using AWS CloudFormation.

## Project Structure

```
StreamFlow/
├── api/                  # API Gateway Lambda functions
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts      # API endpoints
├── consumer/             # SQS consumer Lambda function
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts      # Original consumer (non-Lambda)
│       └── lambda.ts     # Lambda handler for SQS events
├── job/                  # Video transcoding container
│   ├── Dockerfile
│   ├── package.json
│   └── index.js          # Video transcoding logic
├── index.html            # Frontend web UI
└── cloudformation.yaml   # Infrastructure as code
```

## Getting Started

### Prerequisites

- AWS Account
- AWS CLI configured
- Node.js and npm/yarn
- Docker (for building the container)

### StreamFlow

StreamFlow is a serverless video streaming platform that allows users to upload videos, process them into adaptive HLS streams, and play them back with a modern, responsive React interface.

## Architecture

The StreamFlow platform consists of the following components:

1. **Consumer Service (Lambda)**: Processes S3 events when videos are uploaded and triggers transcoding jobs
2. **Transcoding Job (ECS/Fargate)**: Converts videos to HLS format with multiple quality levels
3. **API (Lambda + API Gateway)**: Provides endpoints to list videos and get video details
4. **Frontend (React + Tailwind CSS)**: Modern UI for browsing and watching videos
5. **DynamoDB**: Stores video metadata and processing status
6. **S3 Buckets**: Store original videos and processed HLS streams

## Development

### Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate credentials
- Docker (for the transcoding job)

### Local Development

1. **Setup the environment**:
```bash
# Install dependencies for all components
cd consumer && npm install && cd ..
cd api && npm install && cd ..
cd frontend && npm install && cd ..
```

2. **Run the frontend locally**:
```bash
cd frontend
npm run dev
```

3. **Build the components**:
```bash
# Build the consumer
cd consumer && npm run build && cd ..

# Build the API
cd api && npm run build && cd ..

# Build the frontend
cd frontend && npm run build && cd ..
```

## Deployment

You can deploy StreamFlow using the provided deployment script:

```bash
# Make sure the script is executable
chmod +x deploy.sh

# Deploy with your bucket names
./deploy.sh --source-bucket your-source-bucket --dest-bucket your-destination-bucket
```

Alternatively, you can deploy manually:

#### Option 1: Using CloudFormation

1. **Set up the S3 buckets**:
```bash
aws s3 mb s3://your-source-bucket-name
aws s3 mb s3://your-destination-bucket-name
```

2. **Enable CORS on the destination bucket**:
```bash
aws s3api put-bucket-cors --bucket your-destination-bucket-name --cors-configuration file://cors-config.json
```

3. **Build and push the Docker image**:
```bash
cd job
docker build -t video-transcoder .
aws ecr get-login-password --region your-region | docker login --username AWS --password-stdin your-account-id.dkr.ecr.your-region.amazonaws.com
aws ecr create-repository --repository-name video-transcoder
docker tag video-transcoder:latest your-account-id.dkr.ecr.your-region.amazonaws.com/video-transcoder:latest
docker push your-account-id.dkr.ecr.your-region.amazonaws.com/video-transcoder:latest
```

4. **Deploy CloudFormation stack**:
```bash
aws cloudformation deploy \
  --template-file cloudformation.yaml \
  --stack-name streamflow \
  --parameter-overrides \
    SourceBucketName=your-source-bucket-name \
    DestinationBucketName=your-destination-bucket-name \
  --capabilities CAPABILITY_IAM
```

#### Option 2: Using Serverless Framework

1. **Install the Serverless Framework**:
```bash
npm install -g serverless
```

2. **Set up the S3 buckets**:
```bash
aws s3 mb s3://your-source-bucket-name
aws s3 mb s3://your-destination-bucket-name
```

3. **Enable CORS on the destination bucket**:
```bash
aws s3api put-bucket-cors --bucket your-destination-bucket-name --cors-configuration file://cors-config.json
```

4. **Build and push the Docker image**:
```bash
cd job
docker build -t video-transcoder .
aws ecr get-login-password --region your-region | docker login --username AWS --password-stdin your-account-id.dkr.ecr.your-region.amazonaws.com
aws ecr create-repository --repository-name video-transcoder
docker tag video-transcoder:latest your-account-id.dkr.ecr.your-region.amazonaws.com/video-transcoder:latest
docker push your-account-id.dkr.ecr.your-region.amazonaws.com/video-transcoder:latest
```

5. **Create ECS Cluster and Task Definition**:
```bash
aws ecs create-cluster --cluster-name video-transcoder-cluster
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

6. **Deploy the Serverless application**:
```bash
npm run build
serverless deploy --bucket your-destination-bucket-name --region your-region
```

7. **Build and deploy the frontend**:
```bash
cd frontend
npm install
npm run build
aws s3 cp dist/ s3://your-destination-bucket/ --recursive --acl public-read
```

## Cleanup

To avoid incurring AWS charges, use the cleanup script when you're done testing:

```bash
# Make sure the script is executable
chmod +x cleanup.sh

# Run the cleanup
./cleanup.sh --source-bucket your-source-bucket --dest-bucket your-destination-bucket
```

## Usage

After deployment, you can:

1. **Upload a video**:
```bash
aws s3 cp your-video.mp4 s3://your-source-bucket/username###video-name.mp4
```

2. **View the website**:
Visit `http://your-destination-bucket.s3-website-your-region.amazonaws.com`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Usage

1. **Upload a video**:
```bash
# The file name must follow the format: username###video-name.mp4
aws s3 cp your-video.mp4 s3://your-source-bucket-name/username###video-name.mp4
```

2. **Monitor processing**:
   - Check CloudWatch Logs for the Lambda function and ECS task
   - Check the DynamoDB table for video status

3. **View videos**:
   - Access the frontend at `http://your-destination-bucket-name.s3-website-your-region.amazonaws.com/`

## Future Improvements

- Add user authentication/authorization
- Add direct upload from the web UI
- Implement DRM for content protection
- Add analytics for video views
- Support more input formats
- Add automatic subtitle generation

## License

This project is licensed under the MIT License - see the LICENSE file for details.
