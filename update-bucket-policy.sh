#!/bin/bash

# Script to update the S3 bucket policy to allow public read access without modifying ACLs

# Set variables - these should match your deployed environment
DESTINATION_BUCKET="production.adarshsahu.site"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}StreamFlow Bucket Policy Update Tool${NC}"
echo -e "${YELLOW}============================================${NC}"
echo

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed.${NC}"
    echo "Please install AWS CLI and configure it with appropriate credentials."
    exit 1
fi

# Validate the AWS CLI configuration
echo "Checking AWS CLI configuration..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not properly configured.${NC}"
    echo "Please configure AWS CLI with 'aws configure' and try again."
    exit 1
fi

echo -e "${GREEN}✓${NC} AWS CLI is properly configured."
echo

# Check if the bucket exists
echo "Checking if bucket ${DESTINATION_BUCKET} exists..."
if ! aws s3api head-bucket --bucket ${DESTINATION_BUCKET} 2>/dev/null; then
    echo -e "${RED}Error: Bucket ${DESTINATION_BUCKET} does not exist or you don't have access to it.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Bucket ${DESTINATION_BUCKET} exists and is accessible."
echo

# Get current bucket policy if it exists
echo "Checking current bucket policy..."
CURRENT_POLICY=$(aws s3api get-bucket-policy --bucket ${DESTINATION_BUCKET} --query Policy --output text 2>/dev/null || echo "")

if [ -z "$CURRENT_POLICY" ]; then
    echo "No existing bucket policy found. Creating a new one..."
    NEW_POLICY='{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicReadForVideoFiles",
                "Effect": "Allow",
                "Principal": "*",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::'${DESTINATION_BUCKET}'/*"
            }
        ]
    }'
else
    echo "Existing bucket policy found. Checking if it needs to be updated..."
    # Check if policy already has a statement for public read access
    if echo "$CURRENT_POLICY" | grep -q "s3:GetObject" && echo "$CURRENT_POLICY" | grep -q "Principal.*\"\\*\""; then
        echo -e "${GREEN}Bucket policy already allows public read access.${NC}"
        echo "Current policy:"
        echo "$CURRENT_POLICY" | python3 -m json.tool
        echo
        echo "No changes needed."
        exit 0
    else
        echo "Existing policy needs to be updated to allow public read access."
        # Parse current policy and add a new statement
        TEMP_POLICY_FILE=$(mktemp)
        echo "$CURRENT_POLICY" > "$TEMP_POLICY_FILE"
        
        # Use Python to update the policy
        NEW_POLICY=$(python3 -c '
import json
import sys

try:
    with open("'"$TEMP_POLICY_FILE"'", "r") as f:
        policy = json.load(f)
    
    # Add public read statement
    new_statement = {
        "Sid": "PublicReadForVideoFiles",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::'${DESTINATION_BUCKET}'/*"
    }
    
    # Check if statement already exists
    exists = False
    for stmt in policy["Statement"]:
        if stmt.get("Sid") == "PublicReadForVideoFiles":
            exists = True
            break
    
    if not exists:
        policy["Statement"].append(new_statement)
    
    print(json.dumps(policy))
except Exception as e:
    print(f"Error updating policy: {e}", file=sys.stderr)
    sys.exit(1)
' 2>/dev/null)
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}Error: Failed to update bucket policy.${NC}"
            exit 1
        fi
        
        rm -f "$TEMP_POLICY_FILE"
    fi
fi

# Save policy to a temporary file
POLICY_FILE=$(mktemp)
echo "$NEW_POLICY" > "$POLICY_FILE"

echo
echo "About to apply the following bucket policy to ${DESTINATION_BUCKET}:"
cat "$POLICY_FILE" | python3 -m json.tool
echo

# Confirm action
echo -n "Do you want to apply this policy? (y/n): "
read -r confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    rm -f "$POLICY_FILE"
    exit 0
fi

# Apply the policy
echo "Applying bucket policy..."
if aws s3api put-bucket-policy --bucket ${DESTINATION_BUCKET} --policy file://"$POLICY_FILE"; then
    echo -e "${GREEN}✓ Bucket policy applied successfully!${NC}"
else
    echo -e "${RED}✗ Failed to apply bucket policy.${NC}"
    rm -f "$POLICY_FILE"
    exit 1
fi

# Clean up
rm -f "$POLICY_FILE"

# Check if the bucket blocks public access
echo
echo "Checking if bucket has public access blocks..."
PUBLIC_ACCESS_BLOCKS=$(aws s3api get-public-access-block --bucket ${DESTINATION_BUCKET} 2>/dev/null || echo "")

if [ -n "$PUBLIC_ACCESS_BLOCKS" ]; then
    echo "Public access blocks are configured. Checking settings..."
    BLOCK_PUBLIC_ACLS=$(echo "$PUBLIC_ACCESS_BLOCKS" | grep -o '"BlockPublicAcls": true' | wc -l)
    IGNORE_PUBLIC_ACLS=$(echo "$PUBLIC_ACCESS_BLOCKS" | grep -o '"IgnorePublicAcls": true' | wc -l)
    BLOCK_PUBLIC_POLICY=$(echo "$PUBLIC_ACCESS_BLOCKS" | grep -o '"BlockPublicPolicy": true' | wc -l)
    RESTRICT_PUBLIC_BUCKETS=$(echo "$PUBLIC_ACCESS_BLOCKS" | grep -o '"RestrictPublicBuckets": true' | wc -l)
    
    if [ $BLOCK_PUBLIC_POLICY -eq 1 ] || [ $RESTRICT_PUBLIC_BUCKETS -eq 1 ]; then
        echo -e "${RED}Warning: Bucket has public access blocks that will prevent the policy from working:${NC}"
        [ $BLOCK_PUBLIC_POLICY -eq 1 ] && echo -e "${RED}- BlockPublicPolicy is enabled${NC}"
        [ $RESTRICT_PUBLIC_BUCKETS -eq 1 ] && echo -e "${RED}- RestrictPublicBuckets is enabled${NC}"
        
        echo
        echo -e "${YELLOW}To fix this, you need to update the public access block settings.${NC}"
        echo -n "Do you want to disable these blocks now? (y/n): "
        read -r confirm_blocks
        
        if [[ "$confirm_blocks" =~ ^[Yy]$ ]]; then
            echo "Updating public access block settings..."
            
            # Create a new public access block configuration
            BLOCK_CONFIG='{
                "BlockPublicAcls": true,
                "IgnorePublicAcls": true,
                "BlockPublicPolicy": false,
                "RestrictPublicBuckets": false
            }'
            
            BLOCK_CONFIG_FILE=$(mktemp)
            echo "$BLOCK_CONFIG" > "$BLOCK_CONFIG_FILE"
            
            if aws s3api put-public-access-block --bucket ${DESTINATION_BUCKET} --public-access-block-configuration file://"$BLOCK_CONFIG_FILE"; then
                echo -e "${GREEN}✓ Public access block settings updated successfully!${NC}"
            else
                echo -e "${RED}✗ Failed to update public access block settings.${NC}"
                echo -e "${YELLOW}You may need to update these settings manually in the AWS Console.${NC}"
            fi
            
            rm -f "$BLOCK_CONFIG_FILE"
        else
            echo -e "${YELLOW}The bucket policy may not work until public access blocks are updated.${NC}"
        fi
    else
        echo -e "${GREEN}Public access block settings look good.${NC}"
    fi
else
    echo -e "${GREEN}No public access blocks configured.${NC}"
fi

echo
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Bucket policy update completed!${NC}"
echo -e "${GREEN}============================================${NC}"
echo
echo "All objects in the following bucket should now be publicly readable:"
echo -e "  - ${DESTINATION_BUCKET}"
echo
echo "Your videos should now be accessible through the browser without 403 Access Denied errors."
echo "To verify, try accessing your videos through the StreamFlow web interface:"
echo -e "  http://${DESTINATION_BUCKET}.s3-website.ap-south-1.amazonaws.com"
echo
echo "If you're still experiencing issues, please wait a few minutes for the policy changes to propagate."
