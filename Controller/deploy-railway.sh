#!/bin/bash

echo "========================================"
echo "  Railway Deployment - Bet Controller"
echo "========================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install Railway CLI${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Railway CLI installed successfully${NC}"
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo -e "${BLUE}🔐 Please login to Railway...${NC}"
    railway login
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Login failed${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Logged in to Railway${NC}"

# Check if project is linked
if ! railway status &> /dev/null; then
    echo -e "${BLUE}🔗 Linking to Railway project...${NC}"
    railway init
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to link project${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Project linked to Railway${NC}"

# Deploy to Railway
echo -e "${BLUE}📦 Deploying to Railway...${NC}"
echo
railway up
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo
echo "========================================"
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo "========================================"
echo
echo -e "${YELLOW}🌐 Your application is now live at:${NC}"
railway domain 2>/dev/null
echo
echo -e "${YELLOW}📊 Monitor your deployment:${NC}"
echo "https://railway.com/dashboard"
echo
echo -e "${YELLOW}🔧 Useful commands:${NC}"
echo "  railway logs    - View application logs"
echo "  railway status  - Check deployment status"
echo "  railway domain  - Get your app URL"
echo "  railway up      - Deploy again"
echo 