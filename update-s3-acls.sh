#!/bin/bash

# Script to update ACLs for all existing objects in the StreamFlow S3 buckets
# This will set public-read permissions on all existing objects

# Set variables - these should match your deployed environment
SOURCE_BUCKET="temp-videos.adarshsahu.site"
DESTINATION_BUCKET="production.adarshsahu.site"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}StreamFlow S3 ACL Update Tool${NC}"
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

# Function to update ACLs for all objects in a bucket
update_bucket_acls() {
    local bucket=$1
    local count=0
    local errors=0
    
    echo -e "Updating ACLs for all objects in ${YELLOW}s3://${bucket}${NC}..."
    
    # List all objects in the bucket
    objects=$(aws s3 ls s3://${bucket} --recursive | awk '{print $4}')
    total=$(echo "$objects" | wc -l)
    
    if [ -z "$objects" ]; then
        echo -e "${YELLOW}No objects found in bucket ${bucket}.${NC}"
        return
    fi
    
    echo -e "Found ${YELLOW}${total}${NC} objects. Starting ACL update..."
    
    # Process each object
    while IFS= read -r key; do
        if [ -z "$key" ]; then
            continue
        fi
        
        echo -n "Setting public-read ACL on s3://${bucket}/${key}... "
        
        if aws s3api put-object-acl --bucket ${bucket} --key "${key}" --acl public-read &> /dev/null; then
            echo -e "${GREEN}✓${NC}"
            ((count++))
        else
            echo -e "${RED}✗${NC}"
            ((errors++))
        fi
    done <<< "$objects"
    
    echo
    echo -e "${GREEN}Successfully updated ACLs for ${count}/${total} objects in ${bucket}.${NC}"
    if [ $errors -gt 0 ]; then
        echo -e "${RED}Failed to update ACLs for ${errors} objects.${NC}"
    fi
    echo
}

# Confirm action
echo -e "${YELLOW}WARNING:${NC} This script will update ACLs for ALL objects in the following buckets:"
echo -e "  - ${SOURCE_BUCKET} (source bucket)"
echo -e "  - ${DESTINATION_BUCKET} (destination bucket)"
echo
echo -n "Do you want to continue? (y/n): "
read -r confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo
echo "Starting ACL updates..."
echo

# Update ACLs in source bucket
update_bucket_acls $SOURCE_BUCKET

# Update ACLs in destination bucket
update_bucket_acls $DESTINATION_BUCKET

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}ACL update completed!${NC}"
echo -e "${GREEN}============================================${NC}"
echo
echo "All objects in the following buckets now have public-read ACL:"
echo -e "  - ${SOURCE_BUCKET}"
echo -e "  - ${DESTINATION_BUCKET}"
echo
echo "You can now access your videos without 403 Access Denied errors."
echo "To verify, try accessing one of your video files through the browser."
