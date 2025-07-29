#!/bin/bash

# CloudWatch Logs Monitor Script for StreamFlow Pipeline
# This script tails CloudWatch logs to monitor the video processing pipeline

echo "📊 StreamFlow CloudWatch Logs Monitor"
echo "====================================="
echo ""

# Log groups to monitor
LOG_GROUPS=(
    "/aws/lambda/streamflow-dev-getUploadUrl"
    "/aws/lambda/streamflow-dev-videoProcessor"
    "/aws/lambda/streamflow-dev-getVideos"
    "/aws/lambda/streamflow-dev-getVideo"
)

echo "🔍 Available CloudWatch Log Groups:"
for group in "${LOG_GROUPS[@]}"; do
    echo "  - $group"
done

echo ""
echo "Choose monitoring option:"
echo "1. Monitor all Lambda functions (parallel)"
echo "2. Monitor getUploadUrl function"
echo "3. Monitor videoProcessor function"
echo "4. Monitor specific log group"
echo "5. Show recent logs from all groups"

read -p "Enter your choice (1-5): " CHOICE

case $CHOICE in
    1)
        echo "🚀 Starting parallel monitoring of all Lambda functions..."
        echo "Press Ctrl+C to stop monitoring"
        echo ""
        
        # Start monitoring all groups in parallel
        for group in "${LOG_GROUPS[@]}"; do
            echo "Starting monitor for $group..."
            aws logs tail "$group" --follow --format short &
        done
        
        # Wait for user to stop
        wait
        ;;
        
    2)
        echo "🔍 Monitoring getUploadUrl function..."
        aws logs tail "/aws/lambda/streamflow-dev-getUploadUrl" --follow --format short
        ;;
        
    3)
        echo "🔍 Monitoring videoProcessor function..."
        aws logs tail "/aws/lambda/streamflow-dev-videoProcessor" --follow --format short
        ;;
        
    4)
        echo "Available log groups:"
        aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `streamflow`) || contains(logGroupName, `video`)].logGroupName' --output table
        echo ""
        read -p "Enter log group name: " CUSTOM_GROUP
        echo "🔍 Monitoring $CUSTOM_GROUP..."
        aws logs tail "$CUSTOM_GROUP" --follow --format short
        ;;
        
    5)
        echo "📋 Recent logs from all groups:"
        echo ""
        
        for group in "${LOG_GROUPS[@]}"; do
            echo "----------------------------------------"
            echo "📊 Recent logs from: $group"
            echo "----------------------------------------"
            aws logs tail "$group" --since 1h --format short | tail -20
            echo ""
        done
        ;;
        
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac
