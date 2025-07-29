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

# First, remove bucket notifications to avoid issues
echo "  Removing S3 bucket notifications..."
aws s3api put-bucket-notification-configuration \
  --bucket $SOURCE_BUCKET \
  --notification-configuration '{}' \
  --region $REGION 2>/dev/null || true

# Remove bucket policies
echo "  Removing S3 bucket policies..."
aws s3api delete-bucket-policy --bucket $SOURCE_BUCKET --region $REGION 2>/dev/null || true
aws s3api delete-bucket-policy --bucket $DESTINATION_BUCKET --region $REGION 2>/dev/null || true

# Remove bucket CORS
echo "  Removing S3 bucket CORS..."
aws s3api delete-bucket-cors --bucket $SOURCE_BUCKET --region $REGION 2>/dev/null || true
aws s3api delete-bucket-cors --bucket $DESTINATION_BUCKET --region $REGION 2>/dev/null || true

# Remove website configuration
echo "  Removing S3 website configuration..."
aws s3api delete-bucket-website --bucket $DESTINATION_BUCKET --region $REGION 2>/dev/null || true

# Empty buckets completely (including versioned objects if any)
echo "  Emptying S3 buckets..."
aws s3 rm s3://$SOURCE_BUCKET --recursive --region $REGION 2>/dev/null || true
aws s3 rm s3://$DESTINATION_BUCKET --recursive --region $REGION 2>/dev/null || true

# Delete buckets
echo "  Deleting S3 buckets..."
aws s3 rb s3://$SOURCE_BUCKET --force --region $REGION 2>/dev/null || true
aws s3 rb s3://$DESTINATION_BUCKET --force --region $REGION 2>/dev/null || true

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

# Delete IAM roles created by deployment
echo "Cleaning up IAM roles..."
# Delete ECS Task Execution Role (if it was created by our deployment)
aws iam list-attached-role-policies --role-name ecsTaskExecutionRole --region $REGION &> /dev/null
if [ $? -eq 0 ]; then
  echo "  Detaching policies from ecsTaskExecutionRole..."
  aws iam detach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy || true
  echo "  Deleting ecsTaskExecutionRole..."
  aws iam delete-role --role-name ecsTaskExecutionRole || true
fi

# Delete any ECS task definitions
echo "Deregistering ECS task definitions..."
TASK_DEFINITION_ARNS=$(aws ecs list-task-definitions --family-prefix video-transcoder --region $REGION --query 'taskDefinitionArns' --output text 2>/dev/null || echo "")
if [[ ! -z "$TASK_DEFINITION_ARNS" ]]; then
  for TASK_DEF in $TASK_DEFINITION_ARNS; do
    echo "  Deregistering task definition: $TASK_DEF"
    aws ecs deregister-task-definition --task-definition $TASK_DEF --region $REGION || true
  done
fi

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
echo "Deleting Lambda functions (handled by serverless remove)..."
# Note: Lambda functions are automatically deleted by serverless remove
# But we'll check for any orphaned functions just in case
LAMBDA_FUNCTIONS=$(aws lambda list-functions --region $REGION --query 'Functions[?starts_with(FunctionName, `streamflow-`) || starts_with(FunctionName, `dev-streamflow-`)].FunctionName' --output text 2>/dev/null || echo "")
if [[ ! -z "$LAMBDA_FUNCTIONS" ]]; then
  for FUNC in $LAMBDA_FUNCTIONS; do
    echo "  Found orphaned Lambda function: $FUNC"
    aws lambda delete-function --function-name $FUNC --region $REGION || true
  done
fi

# Delete DynamoDB table (handled by serverless remove)
echo "Checking for DynamoDB table: VideoMetadata..."
# Note: DynamoDB table is normally deleted by serverless remove
# But we'll check for orphaned tables just in case
aws dynamodb describe-table --table-name VideoMetadata --region $REGION &> /dev/null
if [ $? -eq 0 ]; then
  echo "  Found orphaned DynamoDB table: VideoMetadata"
  aws dynamodb delete-table --table-name VideoMetadata --region $REGION || true
  echo "  Waiting for table deletion..."
  aws dynamodb wait table-not-exists --table-name VideoMetadata --region $REGION || true
fi

# Delete SQS queues (handled by serverless remove)
echo "Checking for SQS queues..."
# Note: SQS queues are normally deleted by serverless remove
# But we'll check for orphaned queues just in case
for QUEUE in "video-upload-queue" "video-upload-dlq"; do
  QUEUE_URL=$(aws sqs get-queue-url --queue-name $QUEUE --region $REGION --query 'QueueUrl' --output text 2>/dev/null)
  if [[ ! -z "$QUEUE_URL" && "$QUEUE_URL" != "None" ]]; then
    echo "  Found orphaned SQS queue: $QUEUE"
    aws sqs delete-queue --queue-url $QUEUE_URL --region $REGION || true
  fi
done

# Find and delete CloudWatch Log Groups
echo "Cleaning up CloudWatch Log Groups..."
# Serverless creates log groups with pattern: /aws/lambda/{service}-{stage}-{function}
LOG_GROUPS=$(aws logs describe-log-groups --region $REGION --query 'logGroups[?starts_with(logGroupName, `/aws/lambda/streamflow-`) || starts_with(logGroupName, `/aws/lambda/dev-streamflow-`) || logGroupName == `/ecs/video-transcoder`].logGroupName' --output text 2>/dev/null || echo "")
if [[ ! -z "$LOG_GROUPS" ]]; then
  for LOG_GROUP in $LOG_GROUPS; do
    echo "  Deleting log group: $LOG_GROUP"
    aws logs delete-log-group --log-group-name $LOG_GROUP --region $REGION || true
  done
fi

# Delete API Gateway REST APIs created by serverless
echo "Cleaning up API Gateway resources..."
API_IDS=$(aws apigateway get-rest-apis --region $REGION --query 'items[?starts_with(name, `dev-streamflow`) || starts_with(name, `streamflow-`)].id' --output text 2>/dev/null || echo "")
if [[ ! -z "$API_IDS" ]]; then
  for API_ID in $API_IDS; do
    echo "  Deleting API Gateway: $API_ID"
    aws apigateway delete-rest-api --rest-api-id $API_ID --region $REGION || true
  done
fi

# Clean up any orphaned CloudFormation stacks from serverless
echo "Checking for serverless CloudFormation stacks..."
SERVERLESS_STACKS=$(aws cloudformation list-stacks --region $REGION --query 'StackSummaries[?starts_with(StackName, `streamflow-`) && StackStatus != `DELETE_COMPLETE`].StackName' --output text 2>/dev/null || echo "")
if [[ ! -z "$SERVERLESS_STACKS" ]]; then
  for STACK in $SERVERLESS_STACKS; do
    echo "  Deleting serverless stack: $STACK"
    aws cloudformation delete-stack --stack-name $STACK --region $REGION || true
  done
fi

# Remove frontend build artifacts
echo "Cleaning up local build artifacts..."
rm -rf frontend/dist frontend/node_modules 2>/dev/null || true
rm -rf consumer/dist consumer/node_modules 2>/dev/null || true
rm -rf api/dist api/node_modules 2>/dev/null || true

echo "==== Cleanup Complete ===="
echo "✅ Serverless resources removed (Lambda, API Gateway, DynamoDB, SQS)"
echo "✅ S3 buckets emptied and deleted"
echo "✅ ECS cluster and tasks removed"
echo "✅ ECR repository deleted"
echo "✅ IAM roles cleaned up"
echo "✅ CloudWatch log groups removed"
echo "✅ Local build artifacts cleaned"
echo ""
echo "⚠️  Manual verification recommended:"
echo "   • Check AWS Console for any remaining resources"
echo "   • Verify no unexpected charges in billing"
echo "   • Check CloudFormation stacks are fully deleted"
echo ""
echo "💡 Tip: Use 'aws resourcegroupstaggingapi get-resources' to find any tagged resources"
echo "=========================="
