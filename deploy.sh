#!/bin/bash

# StreamFlow Deployment Script
# This script will deploy the StreamFlow application to AWS

# Set default values
REGION="ap-south-1"
SOURCE_BUCKET=""
DESTINATION_BUCKET=""
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Print usage information
function usage {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -s, --source-bucket     Source bucket name (required)"
  echo "  -d, --dest-bucket       Destination bucket name (required)"
  echo "  -r, --region            AWS region (default: ap-south-1)"
  echo "  -h, --help              Display this help message"
  exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--source-bucket)
      SOURCE_BUCKET="$2"
      shift 2
      ;;
    -d|--dest-bucket)
      DESTINATION_BUCKET="$2"
      shift 2
      ;;
    -r|--region)
      REGION="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Check required parameters
if [[ -z "$SOURCE_BUCKET" || -z "$DESTINATION_BUCKET" ]]; then
  echo "Error: Source bucket and destination bucket are required"
  usage
fi

echo "==== StreamFlow Deployment ===="
echo "Region: $REGION"
echo "Source Bucket: $SOURCE_BUCKET"
echo "Destination Bucket: $DESTINATION_BUCKET"
echo "Account ID: $ACCOUNT_ID"
echo "=============================="

# Create S3 buckets if they don't exist
echo "Creating S3 buckets..."
aws s3 mb s3://$SOURCE_BUCKET --region $REGION || true
aws s3 mb s3://$DESTINATION_BUCKET --region $REGION || true

# Configure CORS on destination bucket
echo "Configuring CORS on destination bucket..."
aws s3api put-bucket-cors --bucket $DESTINATION_BUCKET --cors-configuration file://cors-config.json

# Build the consumer and API components
echo "Building Lambda functions..."
cd consumer && npm run build && cd ..
cd api && npm run build && cd ..

# Build the React frontend
echo "Building React frontend..."
cd frontend
# Install dependencies if not already installed
npm install --quiet
# Build the frontend
npm run build
# Go back to the root directory
cd ..

# Build and push Docker image for the transcoder
echo "Building and pushing Docker image..."
cd job

# Update the task definition with the correct account and region
sed -i "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" ../task-definition.json
sed -i "s/YOUR_REGION/$REGION/g" ../task-definition.json

# Build Docker image
docker build -t video-transcoder .

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names video-transcoder --region $REGION || \
  aws ecr create-repository --repository-name video-transcoder --region $REGION

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Tag and push the image
docker tag video-transcoder:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/video-transcoder:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/video-transcoder:latest

cd ..

# Create ECS cluster if it doesn't exist
echo "Setting up ECS resources..."
aws ecs describe-clusters --clusters video-transcoder-cluster --region $REGION || \
  aws ecs create-cluster --cluster-name video-transcoder-cluster --region $REGION

# Create IAM roles for ECS tasks
echo "Creating IAM roles..."
# This is simplified - in a real deployment you would create these roles with proper policies

# Register the task definition
echo "Registering ECS task definition..."
aws ecs register-task-definition --cli-input-json file://task-definition.json --region $REGION

# Deploy the serverless application
echo "Deploying serverless application..."
serverless deploy --bucket $DESTINATION_BUCKET --region $REGION

# Upload the frontend
echo "Uploading frontend..."
aws s3 cp frontend/dist/ s3://$DESTINATION_BUCKET/ --recursive --acl public-read
aws s3 website s3://$DESTINATION_BUCKET --index-document index.html --error-document index.html

# Update the frontend .env file with the real API endpoint
API_ENDPOINT=$(serverless info --verbose | grep -A 1 "ServiceEndpoint:" | tail -n 1 | tr -d '[:space:]')
if [[ ! -z "$API_ENDPOINT" ]]; then
  echo "Updating frontend with API endpoint: $API_ENDPOINT"
  # Create a new .env file for future builds
  echo "VITE_API_ENDPOINT=$API_ENDPOINT" > frontend/.env
fi

echo "==== Deployment Complete ===="
echo "Frontend URL: http://$DESTINATION_BUCKET.s3-website-$REGION.amazonaws.com"
echo "API Endpoint: $API_ENDPOINT"
echo "============================"

echo "To test the system, upload a video to the source bucket:"
echo "aws s3 cp your-video.mp4 s3://$SOURCE_BUCKET/username###video-name.mp4"
