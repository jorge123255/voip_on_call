#!/bin/bash
# Deployment script for Unraid server

set -e

UNRAID_HOST="192.168.1.106"
UNRAID_USER="root"
DEPLOY_PATH="/mnt/user/appdata/voip-forwarder"

echo "================================================"
echo "VOIP Call Forwarder - Unraid Deployment Script"
echo "================================================"
echo ""
echo "Target: ${UNRAID_USER}@${UNRAID_HOST}"
echo "Deploy Path: ${DEPLOY_PATH}"
echo ""

# Check if we can connect
echo "Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 ${UNRAID_USER}@${UNRAID_HOST} "echo 'Connection successful'"; then
    echo "ERROR: Cannot connect to Unraid server"
    exit 1
fi

echo ""
echo "Creating deployment directory..."
ssh ${UNRAID_USER}@${UNRAID_HOST} "mkdir -p ${DEPLOY_PATH}"

echo "Copying files to Unraid server..."
rsync -avz --progress \
    --exclude '.git' \
    --exclude 'logs' \
    --exclude 'data' \
    ./ ${UNRAID_USER}@${UNRAID_HOST}:${DEPLOY_PATH}/

echo ""
echo "Building Docker container on Unraid..."
ssh ${UNRAID_USER}@${UNRAID_HOST} "cd ${DEPLOY_PATH} && docker-compose build"

echo ""
echo "Starting VOIP Call Forwarder..."
ssh ${UNRAID_USER}@${UNRAID_HOST} "cd ${DEPLOY_PATH} && docker-compose up -d"

echo ""
echo "Waiting for service to start..."
sleep 10

echo ""
echo "Checking service status..."
ssh ${UNRAID_USER}@${UNRAID_HOST} "cd ${DEPLOY_PATH} && docker-compose ps"

echo ""
echo "================================================"
echo "Deployment Complete!"
echo "================================================"
echo ""
echo "Service Details:"
echo "  - Container IP: 192.168.1.106"
echo "  - SIP Port: 5060"
echo "  - Management API: http://192.168.1.106:8080"
echo ""
echo "Next Steps:"
echo "  1. Configure SIP trunk in: ${DEPLOY_PATH}/asterisk/configs/sip.conf"
echo "  2. Update on-call schedule: ${DEPLOY_PATH}/config/oncall.json"
echo "  3. Change default SIP password in sip.conf"
echo "  4. Test API: curl http://192.168.1.106:8080/api/oncall"
echo ""
echo "View logs:"
echo "  ssh ${UNRAID_USER}@${UNRAID_HOST} 'cd ${DEPLOY_PATH} && docker-compose logs -f'"
echo ""
