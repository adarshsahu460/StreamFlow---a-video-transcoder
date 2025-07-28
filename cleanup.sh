#!/bin/bash

# StreamFlow Cleanup Script
# This script will delete all AWS resources created by the StreamFlow deployment
# to prevent ongoing charges when you're not using the system.

# Set default values
REGION="ap-south-1"
SOURCE_BUCKET=""
DESTINATION_BUCKET=""
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_NAME="streamflow"
CONFIRM="no"

# Print usage information
function usage {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -s, --source-bucket     Source bucket name (required)"
  echo "  -d, --dest-bucket       Destination bucket name (required)"
  echo "  -r, --region            AWS region (default: ap-south-1)"
  echo "  -y, --yes               Skip confirmation prompts"
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
    -y|--yes)
      CONFIRM="yes"
      shift
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

echo "==== StreamFlow Cleanup ===="
echo "This script will DELETE the following AWS resources:"
echo "- Source S3 Bucket: $SOURCE_BUCKET"
echo "- Destination S3 Bucket: $DESTINATION_BUCKET"
echo "- Serverless deployment and all related resources"
echo "- ECS Cluster: video-transcoder-cluster"
echo "- ECR Repository: video-transcoder"
echo "- CloudFormation Stack: $STACK_NAME (if exists)"
echo "- Associated Lambda functions, API Gateway, and other resources"
echo "============================="

if [[ "$CONFIRM" != "yes" ]]; then
  read -p "Are you sure you want to proceed? This will DELETE ALL resources. (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Cleanup aborted."
    exit 0
  fi
fi

echo "Starting cleanup process..."

# Remove the serverless deployment
echo "Removing serverless deployment..."
serverless remove --region $REGION || true

# Empty and delete S3 buckets
echo "Emptying and deleting S3 buckets..."
aws s3 rm s3://$SOURCE_BUCKET --recursive --region $REGION || true
aws s3 rb s3://$SOURCE_BUCKET --force --region $REGION || true
aws s3 rm s3://$DESTINATION_BUCKET --recursive --region $REGION || true
aws s3 rb s3://$DESTINATION_BUCKET --force --region $REGION || true

# Delete ECS resources
echo "Deleting ECS resources..."
# List all ECS tasks and stop them
TASK_ARNS=$(aws ecs list-tasks --cluster video-transcoder-cluster --region $REGION --query 'taskArns' --output text)
if [[ ! -z "$TASK_ARNS" ]]; then
  for TASK in $TASK_ARNS; do
    echo "  Stopping ECS task: $TASK"
    aws ecs stop-task --cluster video-transcoder-cluster --task $TASK --region $REGION || true
  done
fi

# Delete the ECS cluster
echo "  Deleting ECS cluster: video-transcoder-cluster"
aws ecs delete-cluster --cluster video-transcoder-cluster --region $REGION || true

# Delete the ECR repository
echo "Deleting ECR repository..."
aws ecr delete-repository --repository-name video-transcoder --force --region $REGION || true

# Delete CloudFormation stack if it exists
echo "Checking for CloudFormation stack..."
aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null
if [ $? -eq 0 ]; then
  echo "  Deleting CloudFormation stack: $STACK_NAME"
  aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
  echo "  Waiting for stack deletion to complete..."
  aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $REGION
fi

# Delete Lambda functions
echo "Deleting Lambda functions..."
for FUNC in "video-processor-lambda" "video-api-lambda"; do
  echo "  Checking for Lambda function: $FUNC"
  aws lambda get-function --function-name $FUNC --region $REGION &> /dev/null
  if [ $? -eq 0 ]; then
    echo "  Deleting Lambda function: $FUNC"
    aws lambda delete-function --function-name $FUNC --region $REGION || true
  fi
done

# Delete DynamoDB table
echo "Checking for DynamoDB table: VideoMetadata"
aws dynamodb describe-table --table-name VideoMetadata --region $REGION &> /dev/null
if [ $? -eq 0 ]; then
  echo "  Deleting DynamoDB table: VideoMetadata"
  aws dynamodb delete-table --table-name VideoMetadata --region $REGION || true
fi

# Delete SQS queues
echo "Checking for SQS queues..."
for QUEUE in "video-upload-queue" "video-upload-dlq"; do
  QUEUE_URL=$(aws sqs get-queue-url --queue-name $QUEUE --region $REGION --query 'QueueUrl' --output text 2>/dev/null)
  if [[ ! -z "$QUEUE_URL" && "$QUEUE_URL" != "None" ]]; then
    echo "  Deleting SQS queue: $QUEUE"
    aws sqs delete-queue --queue-url $QUEUE_URL --region $REGION || true
  fi
done

# Find and delete CloudWatch Log Groups
echo "Cleaning up CloudWatch Log Groups..."
LOG_GROUPS=$(aws logs describe-log-groups --log-group-name-prefix /aws/lambda/video --region $REGION --query 'logGroups[*].logGroupName' --output text)
if [[ ! -z "$LOG_GROUPS" ]]; then
  for LOG_GROUP in $LOG_GROUPS; do
    echo "  Deleting log group: $LOG_GROUP"
    aws logs delete-log-group --log-group-name $LOG_GROUP --region $REGION || true
  done
fi

# Also delete the ECS log group
aws logs delete-log-group --log-group-name /ecs/video-transcoder --region $REGION || true

# Remove frontend build artifacts
echo "Cleaning up local build artifacts..."
rm -rf frontend/dist frontend/node_modules 2>/dev/null || true
rm -rf consumer/dist consumer/node_modules 2>/dev/null || true
rm -rf api/dist api/node_modules 2>/dev/null || true

echo "==== Cleanup Complete ===="
echo "Most resources should now be deleted. Please check your AWS Console to ensure"
echo "no resources remain to prevent unexpected charges."
echo "=========================="
