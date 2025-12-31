#!/bin/bash
# GXML Web - Production Mode
# Builds frontend and runs via PM2

cd /Users/morgan/Projects/gxml-web

echo "Stopping development servers..."
tmux kill-session -t gxml-dev 2>/dev/null
pkill -f "uvicorn.*8000" 2>/dev/null

echo "Building frontend..."
cd frontend
npm run build

echo "Starting production server via PM2..."
cd /Users/morgan/Projects/gxml-web
pm2 start ~/Projects/gxml-web/start.sh --name gxml-web 2>/dev/null || pm2 restart gxml-web
pm2 save

echo ""
echo "Production server running!"
echo "Site: https://gxml.modavi.ca"
echo ""
echo "Commands:"
echo "  pm2 logs gxml-web    # View logs"
echo "  pm2 status           # Check status"
echo "  ./dev.sh             # Switch to development"
