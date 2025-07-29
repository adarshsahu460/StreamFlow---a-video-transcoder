#!/bin/bash

# Script to update ACLs for specific objects or prefixes in the StreamFlow S3 buckets
# This will set public-read permissions on matching objects

# Set variables - these should match your deployed environment
SOURCE_BUCKET="temp-videos.adarshsahu.site"
DESTINATION_BUCKET="production.adarshsahu.site"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -b, --bucket BUCKET    Specify the bucket (source, destination, or custom name)"
    echo "  -p, --prefix PREFIX    Specify a prefix/directory to update (e.g., 'processed/')"
    echo "  -s, --suffix SUFFIX    Specify a file suffix to update (e.g., '.mp4', '.m3u8')"
    echo "  -h, --help             Show this help message"
    echo
    echo "Examples:"
    echo "  $0 --bucket destination --prefix processed/ --suffix .m3u8"
    echo "  $0 --bucket source"
    echo "  $0 --bucket custom-bucket-name --suffix .mp4"
    exit 1
}

# Parse command line arguments
BUCKET=""
PREFIX=""
SUFFIX=""

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -b|--bucket)
            if [[ "$2" == "source" ]]; then
                BUCKET="$SOURCE_BUCKET"
            elif [[ "$2" == "destination" ]]; then
                BUCKET="$DESTINATION_BUCKET"
            else
                BUCKET="$2"
            fi
            shift 2
            ;;
        -p|--prefix)
            PREFIX="$2"
            shift 2
            ;;
        -s|--suffix)
            SUFFIX="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

if [ -z "$BUCKET" ]; then
    echo -e "${RED}Error: You must specify a bucket with --bucket.${NC}"
    usage
fi

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}StreamFlow S3 Targeted ACL Update Tool${NC}"
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

# Construct the ls command based on provided options
LS_CMD="aws s3 ls s3://${BUCKET}"
if [ ! -z "$PREFIX" ]; then
    LS_CMD="${LS_CMD}/${PREFIX} --recursive"
else
    LS_CMD="${LS_CMD} --recursive"
fi

echo -e "Listing objects in ${YELLOW}s3://${BUCKET}${NC} with:"
[ ! -z "$PREFIX" ] && echo -e "  - Prefix: ${YELLOW}${PREFIX}${NC}"
[ ! -z "$SUFFIX" ] && echo -e "  - Suffix: ${YELLOW}${SUFFIX}${NC}"
echo

# List objects and filter based on suffix if provided
if [ ! -z "$SUFFIX" ]; then
    objects=$(eval "$LS_CMD" | awk '{print $4}' | grep "${SUFFIX}$")
else
    objects=$(eval "$LS_CMD" | awk '{print $4}')
fi

total=$(echo "$objects" | grep -v "^$" | wc -l)

if [ $total -eq 0 ]; then
    echo -e "${YELLOW}No matching objects found.${NC}"
    exit 0
fi

echo -e "Found ${YELLOW}${total}${NC} matching objects."
echo

# Confirm action
echo -e "${YELLOW}WARNING:${NC} This script will update ACLs for ${total} objects in ${BUCKET}"
echo -n "Do you want to continue? (y/n): "
read -r confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo
echo "Starting ACL updates..."
echo

# Process each object
count=0
errors=0

while IFS= read -r key; do
    if [ -z "$key" ]; then
        continue
    fi
    
    echo -n "Setting public-read ACL on s3://${BUCKET}/${key}... "
    
    if aws s3api put-object-acl --bucket ${BUCKET} --key "${key}" --acl public-read &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
        ((count++))
    else
        echo -e "${RED}✗${NC}"
        ((errors++))
    fi
done <<< "$objects"

echo
echo -e "${GREEN}Successfully updated ACLs for ${count}/${total} objects.${NC}"
if [ $errors -gt 0 ]; then
    echo -e "${RED}Failed to update ACLs for ${errors} objects.${NC}"
fi
echo

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}ACL update completed!${NC}"
echo -e "${GREEN}============================================${NC}"
echo
echo "The updated objects should now be accessible via browser without 403 errors."
echo
echo "To verify access to video files, try accessing:"
echo -e "  https://s3.ap-south-1.amazonaws.com/${BUCKET}/[path-to-video-file]"
