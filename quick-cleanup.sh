#!/bin/bash

# StreamFlow Quick Cleanup Script
# This script uses the pre-configured bucket names and cleans up everything

echo "🧹 Starting StreamFlow cleanup with default configuration..."
echo ""
echo "⚠️  WARNING: This will DELETE ALL StreamFlow resources!"
echo "   🗄️  S3 buckets and all uploaded videos"
echo "   ⚡ Lambda functions and API endpoints"
echo "   📊 DynamoDB table and video metadata"
echo "   🐳 Docker images and ECS resources"
echo "   📋 CloudWatch logs and monitoring data"
echo ""

# Use the existing bucket names from your setup
SOURCE_BUCKET="temp-videos.adarshsahu.site"
DESTINATION_BUCKET="production.adarshsahu.site"

read -p "Are you absolutely sure you want to proceed? Type 'DELETE' to confirm: " CONFIRM

if [[ "$CONFIRM" != "DELETE" ]]; then
  echo "❌ Cleanup aborted. No resources were deleted."
  exit 0
fi

echo ""
echo "🚨 Starting deletion process..."

# Run the full cleanup
./cleanup.sh --source-bucket "$SOURCE_BUCKET" --dest-bucket "$DESTINATION_BUCKET" --yes

echo ""
echo "✅ Quick cleanup complete!"
echo ""
echo "🔍 Next steps:"
echo "   1. Check AWS Console to verify all resources are gone"
echo "   2. Monitor AWS billing for next few days"
echo "   3. If you see any charges, check for orphaned resources"
echo ""
echo "💰 Cost savings: All AWS resources have been removed to prevent ongoing charges"
