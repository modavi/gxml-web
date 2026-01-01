#!/bin/bash
# GXML Web - Development Mode
# Runs both backend and frontend with hot reload

cd /Users/morgan/Projects/gxml-web

echo "Stopping production PM2 process..."
pm2 stop gxml-web 2>/dev/null

echo "Killing existing dev processes..."
pkill -f "vite" 2>/dev/null
pkill -f "uvicorn gxml_web" 2>/dev/null

echo "Killing existing tmux session..."
tmux kill-session -t gxml-dev 2>/dev/null
sleep 1

echo "Clearing Vite cache..."
rm -rf /Users/morgan/Projects/gxml-web/frontend/node_modules/.vite 2>/dev/null

echo "Clearing Python cache..."
find /Users/morgan/Projects/gxml-web/src -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find /Users/morgan/Projects/gxml -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

echo ""
echo "Starting development servers..."
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""

# Use tmux to run both processes
tmux new-session -d -s gxml-dev -n backend
tmux send-keys -t gxml-dev:backend "cd /Users/morgan/Projects/gxml-web && source venv/bin/activate && uvicorn gxml_web.app:app --host 0.0.0.0 --port 8000 --reload --reload-dir . --reload-dir ../gxml/src" C-m

tmux new-window -t gxml-dev -n frontend
tmux send-keys -t gxml-dev:frontend "cd /Users/morgan/Projects/gxml-web/frontend && npm run dev -- --host 0.0.0.0" C-m

echo "Dev servers started in tmux session 'gxml-dev'"
echo ""
echo "Commands:"
echo "  tmux attach -t gxml-dev     # View logs"
echo "  tmux kill-session -t gxml-dev  # Stop dev servers"
echo "  ./prod.sh                   # Switch to production"
