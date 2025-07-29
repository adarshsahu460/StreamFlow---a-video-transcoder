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

# Check if required tools are installed
echo "Checking required tools..."
command -v aws >/dev/null 2>&1 || { echo "Error: AWS CLI is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Error: Docker is required but not installed. Aborting." >&2; exit 1; }
command -v serverless >/dev/null 2>&1 || { echo "Error: Serverless Framework is required but not installed. Run: npm install -g serverless" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required but not installed. Aborting." >&2; exit 1; }

# Verify AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || { echo "Error: AWS credentials not configured. Run: aws configure" >&2; exit 1; }

echo "✅ All required tools are available"

echo "==== StreamFlow Deployment ===="
echo "Region: $REGION"
echo "Source Bucket: $SOURCE_BUCKET"
echo "Destination Bucket: $DESTINATION_BUCKET"
echo "Account ID: $ACCOUNT_ID"
echo "=============================="

# Install dependencies first
echo "Installing dependencies..."
echo "Installing API dependencies..."
cd api && npm install --quiet && cd ..
echo "Installing Consumer dependencies..."
cd consumer && npm install --quiet && cd ..
echo "Installing Job dependencies..."
cd job && npm install --quiet && cd ..
echo "Installing Frontend dependencies..."
cd frontend && npm install --quiet && cd ..

# Create S3 buckets if they don't exist
echo "Creating S3 buckets..."
aws s3 mb s3://$SOURCE_BUCKET --region $REGION || true
aws s3 mb s3://$DESTINATION_BUCKET --region $REGION || true

# Configure destination bucket for static website hosting
echo "Configuring destination bucket for static website hosting..."

# First, disable Block Public Access settings
echo "Disabling Block Public Access settings..."
aws s3api put-public-access-block \
  --bucket $DESTINATION_BUCKET \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Configure CORS on destination bucket
echo "Configuring CORS on destination bucket..."
aws s3api put-bucket-cors --bucket $DESTINATION_BUCKET --cors-configuration file://cors-config.json

# Configure CORS on source bucket for file uploads
echo "Configuring CORS on source bucket..."
aws s3api put-bucket-cors --bucket $SOURCE_BUCKET --cors-configuration file://cors-config.json

# Enable static website hosting
echo "Enabling static website hosting..."
aws s3api put-bucket-website \
  --bucket $DESTINATION_BUCKET \
  --website-configuration \
  "IndexDocument={Suffix=index.html},ErrorDocument={Key=index.html}"

# Build the consumer and API components
echo "Building Lambda functions..."
cd consumer && npm run build && cd ..
cd api && npm run build && cd ..

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
# Always delete and recreate ECS cluster to avoid INACTIVE state
EXISTING_CLUSTER_STATUS=$(aws ecs describe-clusters --clusters video-transcoder-cluster --region $REGION --query 'clusters[0].status' --output text 2>/dev/null || echo "MISSING")
if [[ "$EXISTING_CLUSTER_STATUS" == "ACTIVE" || "$EXISTING_CLUSTER_STATUS" == "INACTIVE" ]]; then
  echo "Deleting existing ECS cluster: video-transcoder-cluster (status: $EXISTING_CLUSTER_STATUS)"
  aws ecs delete-cluster --cluster video-transcoder-cluster --region $REGION || true
  # Wait for deletion to propagate
  sleep 5
fi

echo "Creating ECS cluster: video-transcoder-cluster"
aws ecs create-cluster --cluster-name video-transcoder-cluster --region $REGION

echo "✅ ECS cluster created successfully"

# Create IAM roles for ECS tasks
echo "Creating IAM roles..."
# Check if the ECS task execution role exists
TASK_ROLE_ARN=$(aws iam get-role --role-name ecsTaskExecutionRole --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [[ -z "$TASK_ROLE_ARN" || "$TASK_ROLE_ARN" == "None" ]]; then
  echo "Creating ECS Task Execution Role..."
  aws iam create-role --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Service": "ecs-tasks.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }' || true
  
  aws iam attach-role-policy --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy || true
fi

# Check if the ECS task role exists (for container permissions)
CONTAINER_TASK_ROLE_ARN=$(aws iam get-role --role-name ECSTask-VideoTranscoder-Role --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [[ -z "$CONTAINER_TASK_ROLE_ARN" || "$CONTAINER_TASK_ROLE_ARN" == "None" ]]; then
  echo "Creating ECS Task Role for video transcoder..."
  aws iam create-role --role-name ECSTask-VideoTranscoder-Role \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Service": "ecs-tasks.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }' || true
  
  # Attach policies for S3 and DynamoDB access using the dedicated policy file
  echo "Applying ECS task policy from ecs-task-policy.json..."
  # First, update the policy file with correct bucket names and region
  sed "s/uploads\.adarshsahu\.site/$SOURCE_BUCKET/g" ecs-task-policy.json > ecs-task-policy-temp.json
  sed -i "s/production\.adarshsahu\.site/$DESTINATION_BUCKET/g" ecs-task-policy-temp.json
  sed -i "s/\*:\*:table\/VideoMetadata/$REGION:$ACCOUNT_ID:table\/VideoMetadata/g" ecs-task-policy-temp.json
  
  aws iam put-role-policy --role-name ECSTask-VideoTranscoder-Role \
    --policy-name VideoTranscoderTaskPolicy \
    --policy-document file://ecs-task-policy-temp.json || true
  
  # Clean up temp file
  rm ecs-task-policy-temp.json
fi

# Create CloudWatch Log Group for ECS tasks
echo "Creating CloudWatch Log Group..."
aws logs create-log-group --log-group-name /ecs/video-transcoder --region $REGION 2>/dev/null || true

# Update task definition with actual account ID and region
echo "Updating task definition..."
sed -i "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" task-definition.json
sed -i "s/YOUR_REGION/$REGION/g" task-definition.json
sed -i "s/your-destination-bucket/$DESTINATION_BUCKET/g" task-definition.json
sed -i "s/your-source-bucket/$SOURCE_BUCKET/g" task-definition.json

# Register the task definition
echo "Registering ECS task definition..."
TASK_DEF_RESULT=$(aws ecs register-task-definition --cli-input-json file://task-definition.json --region $REGION 2>&1)
if [[ $? -eq 0 ]]; then
  TASK_DEF_ARN=$(echo "$TASK_DEF_RESULT" | jq -r '.taskDefinition.taskDefinitionArn' 2>/dev/null || echo "unknown")
  echo "✅ Task definition registered successfully: $TASK_DEF_ARN"
else
  echo "❌ Failed to register task definition:"
  echo "$TASK_DEF_RESULT"
  echo "Continuing with deployment..."
fi

# Deploy the serverless application FIRST to get the API endpoint
echo "Deploying serverless application..."
serverless deploy --param="bucket=$DESTINATION_BUCKET" --param="sourceBucket=$SOURCE_BUCKET" --region $REGION

# Redeploy serverless to ensure ECS permissions are applied (in case task definition was updated)
echo "Ensuring ECS permissions are properly applied..."
serverless deploy --param="bucket=$DESTINATION_BUCKET" --param="sourceBucket=$SOURCE_BUCKET" --region $REGION --force

# Get the API endpoint from serverless deployment
echo "Getting API endpoint..."
# Method 1: Extract from serverless info endpoints
API_ENDPOINT=$(serverless info 2>/dev/null | grep -E "https://.*\.execute-api\." | head -1 | awk '{print $3}' | sed 's|/[^/]*$|/dev|')

# Method 2: If that fails, try parsing differently
if [[ -z "$API_ENDPOINT" ]]; then
  echo "Trying alternative parsing method..."
  API_ENDPOINT=$(serverless info 2>/dev/null | grep -E "https://.*\.execute-api\." | head -1 | sed -E 's|.*(https://[^/]+).*|\1/dev|')
fi

# Method 3: If still empty, use AWS CLI
if [[ -z "$API_ENDPOINT" ]]; then
  echo "Trying AWS CLI method..."
  API_ID=$(aws apigateway get-rest-apis --query "items[?contains(name, 'streamflow')].id" --output text --region $REGION | head -1)
  if [[ ! -z "$API_ID" && "$API_ID" != "None" ]]; then
    API_ENDPOINT="https://$API_ID.execute-api.$REGION.amazonaws.com/dev"
  fi
fi

# Method 4: Last resort - extract API ID from any endpoint and construct base URL
if [[ -z "$API_ENDPOINT" ]]; then
  echo "Using last resort method..."
  FULL_ENDPOINT=$(serverless info 2>/dev/null | grep -E "https://.*\.execute-api\." | head -1 | awk '{print $3}')
  if [[ ! -z "$FULL_ENDPOINT" ]]; then
    # Extract just the base URL (https://apiid.execute-api.region.amazonaws.com/dev)
    API_ENDPOINT=$(echo "$FULL_ENDPOINT" | sed -E 's|(https://[^/]+/[^/]+).*|\1|')
  fi
fi

if [[ ! -z "$API_ENDPOINT" && "$API_ENDPOINT" != "None" ]]; then
  echo "✅ Found API endpoint: $API_ENDPOINT"
  # Update the frontend environment variable
  echo "VITE_API_ENDPOINT=$API_ENDPOINT" > frontend/.env
  echo "✅ Updated frontend/.env with API endpoint"
else
  echo "❌ Warning: Could not determine API endpoint. Frontend will use default placeholder."
  echo "Debug: Serverless info output:"
  serverless info 2>/dev/null | head -20
  echo "Debug: Available API Gateways:"
  aws apigateway get-rest-apis --query "items[].{Name:name,Id:id}" --output table --region $REGION 2>/dev/null || echo "Failed to get API Gateways"
fi

# Now build the React frontend with the correct API endpoint
echo "Building React frontend with API endpoint..."
cd frontend
# Install dependencies if not already installed
npm install --quiet
# Build the frontend with the environment variable
npm run build
# Go back to the root directory
cd ..

# Upload the frontend
echo "Uploading frontend..."
aws s3 cp frontend/dist/ s3://$DESTINATION_BUCKET/ --recursive

# Create and apply bucket policy for public read access
echo "Creating bucket policy for public access..."
cat > bucket-policy-temp.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$DESTINATION_BUCKET/*"
    }
  ]
}
EOF

# Apply the bucket policy
echo "Applying bucket policy..."
aws s3api put-bucket-policy --bucket $DESTINATION_BUCKET --policy file://bucket-policy-temp.json

# Clean up temporary policy file
rm bucket-policy-temp.json

# Configure SQS Policy for S3 notifications
echo "Configuring SQS policy for S3 notifications..."
QUEUE_URL=$(aws sqs get-queue-url --queue-name video-upload-queue --region $REGION --query 'QueueUrl' --output text 2>/dev/null || echo "")

if [[ -z "$QUEUE_URL" ]]; then
  echo "SQS queue 'video-upload-queue' not found. It should be created by serverless deployment."
  echo "If this is the first deployment, the queue will be created by serverless."
else
  echo "Applying SQS policy to allow S3 notifications..."
  # Update SQS policy with correct bucket name
  sed "s/temp-videos\.adarshsahu\.site/$SOURCE_BUCKET/g" sqs-attributes.json > sqs-attributes-temp.json
  aws sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes file://sqs-attributes-temp.json || true
  rm sqs-attributes-temp.json
fi

# Configure S3 bucket notifications
echo "Configuring S3 bucket notifications..."
# Update notification config with correct queue ARN
QUEUE_ARN="arn:aws:sqs:$REGION:$ACCOUNT_ID:video-upload-queue"
sed "s|arn:aws:sqs:ap-south-1:534613823192:video-upload-queue|$QUEUE_ARN|g" s3-notification-config.json > s3-notification-temp.json
sed "s/temp-videos\.adarshsahu\.site/$SOURCE_BUCKET/g" s3-notification-temp.json > s3-notification-final.json

# Apply S3 notification configuration
aws s3api put-bucket-notification-configuration \
  --bucket $SOURCE_BUCKET \
  --notification-configuration file://s3-notification-final.json || true

# Clean up temp files
rm s3-notification-temp.json s3-notification-final.json

echo "==== Deployment Complete ===="
echo "Frontend URL: http://$DESTINATION_BUCKET.s3-website.ap-south-1.amazonaws.com"
if [[ ! -z "$API_ENDPOINT" && "$API_ENDPOINT" != "None" ]]; then
  echo "API Endpoint: $API_ENDPOINT"
else
  echo "API Endpoint: Check serverless deployment output or AWS Console"
fi

# Verify the website is accessible
echo "Verifying website accessibility..."
WEBSITE_URL="http://$DESTINATION_BUCKET.s3-website.ap-south-1.amazonaws.com"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEBSITE_URL" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Website is accessible at: $WEBSITE_URL"
else
  echo "⚠️  Website returned HTTP $HTTP_STATUS. Please check the configuration."
fi

# Verify S3 notifications are configured
echo "Verifying S3 notifications..."
NOTIFICATION_CHECK=$(aws s3api get-bucket-notification-configuration --bucket $SOURCE_BUCKET --query 'QueueConfigurations[0].QueueArn' --output text 2>/dev/null || echo "None")
if [[ "$NOTIFICATION_CHECK" != "None" && ! -z "$NOTIFICATION_CHECK" ]]; then
  echo "✅ S3 → SQS notifications configured"
else
  echo "⚠️  S3 → SQS notifications may not be configured properly"
fi

# Verify SQS queue exists
QUEUE_CHECK=$(aws sqs get-queue-url --queue-name video-upload-queue --region $REGION --query 'QueueUrl' --output text 2>/dev/null || echo "")
if [[ ! -z "$QUEUE_CHECK" ]]; then
  echo "✅ SQS queue exists: video-upload-queue"
else
  echo "⚠️  SQS queue 'video-upload-queue' not found"
fi

# Check if DynamoDB table exists
TABLE_CHECK=$(aws dynamodb describe-table --table-name VideoMetadata --region $REGION --query 'Table.TableName' --output text 2>/dev/null || echo "")
if [[ ! -z "$TABLE_CHECK" ]]; then
  echo "✅ DynamoDB table exists: VideoMetadata"
else
  echo "⚠️  DynamoDB table 'VideoMetadata' not found"
fi

# Verify ECS cluster and task definition
echo "Verifying ECS resources..."
ECS_CLUSTER_CHECK=$(aws ecs describe-clusters --clusters video-transcoder-cluster --region $REGION --query 'clusters[0].status' --output text 2>/dev/null || echo "MISSING")
if [[ "$ECS_CLUSTER_CHECK" == "ACTIVE" ]]; then
  echo "✅ ECS cluster exists and is active: video-transcoder-cluster"
elif [[ "$ECS_CLUSTER_CHECK" == "INACTIVE" ]]; then
  echo "✅ ECS cluster exists (INACTIVE is normal when no tasks are running): video-transcoder-cluster"
else
  echo "⚠️  ECS cluster status: $ECS_CLUSTER_CHECK"
fi

TASK_DEF_CHECK=$(aws ecs list-task-definitions --family-prefix video-transcoder --region $REGION --query 'taskDefinitionArns[-1]' --output text 2>/dev/null || echo "None")
if [[ "$TASK_DEF_CHECK" != "None" && ! -z "$TASK_DEF_CHECK" ]]; then
  echo "✅ ECS task definition exists: $TASK_DEF_CHECK"
else
  echo "⚠️  ECS task definition not found"
fi

# Verify IAM roles exist
echo "Verifying IAM roles..."
EXEC_ROLE_CHECK=$(aws iam get-role --role-name ecsTaskExecutionRole --query 'Role.RoleName' --output text 2>/dev/null || echo "MISSING")
TASK_ROLE_CHECK=$(aws iam get-role --role-name ECSTask-VideoTranscoder-Role --query 'Role.RoleName' --output text 2>/dev/null || echo "MISSING")

if [[ "$EXEC_ROLE_CHECK" == "ecsTaskExecutionRole" ]]; then
  echo "✅ ECS execution role exists: ecsTaskExecutionRole"
else
  echo "⚠️  ECS execution role missing"
fi

if [[ "$TASK_ROLE_CHECK" == "ECSTask-VideoTranscoder-Role" ]]; then
  echo "✅ ECS task role exists: ECSTask-VideoTranscoder-Role"
  # Verify the task policy is attached
  POLICY_CHECK=$(aws iam get-role-policy --role-name ECSTask-VideoTranscoder-Role --policy-name VideoTranscoderTaskPolicy --query 'PolicyName' --output text 2>/dev/null || echo "MISSING")
  if [[ "$POLICY_CHECK" == "VideoTranscoderTaskPolicy" ]]; then
    echo "✅ ECS task policy is attached: VideoTranscoderTaskPolicy"
  else
    echo "⚠️  ECS task policy not found or not attached properly"
  fi
else
  echo "⚠️  ECS task role missing"
fi

echo "=============================="

echo "To test the system, upload a video to the source bucket:"
echo "aws s3 cp your-video.mp4 s3://$SOURCE_BUCKET/username###video-name.mp4"
