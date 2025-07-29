#!/bin/bash

# StreamFlow Quick Deploy Script
# This script uses the pre-configured bucket names and deploys everything

echo "🚀 Starting StreamFlow deployment with default configuration..."

# Use the existing bucket names from your setup
SOURCE_BUCKET="temp-videos.adarshsahu.site"
DESTINATION_BUCKET="production.adarshsahu.site"

# Run the full deployment
./deploy.sh --source-bucket "$SOURCE_BUCKET" --dest-bucket "$DESTINATION_BUCKET"

echo "✅ Deployment complete!"
echo ""
echo "📋 What was deployed:"
echo "   🗄️  S3 buckets with CORS and policies"
echo "   🔄 SQS queue with S3 notification permissions"
echo "   📡 S3 → SQS notifications for video uploads"
echo "   ⚡ Lambda functions (API + Consumer) with enhanced logging"
echo "   🐳 Docker image for video transcoding job"
echo "   📊 DynamoDB table for video metadata"
echo "   🌐 React frontend with upload interface"
echo ""
echo "🔗 Access your app at:"
echo "   Frontend: http://$DESTINATION_BUCKET.s3-website.ap-south-1.amazonaws.com"
echo ""
echo "🧪 Test the pipeline:"
echo "   aws s3 cp /path/to/video.mp4 s3://$SOURCE_BUCKET/username###my-video.mp4"
echo "   Then check CloudWatch logs: ./monitor-logs.sh"
