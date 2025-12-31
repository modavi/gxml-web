#!/bin/bash
# Switch nginx to production mode (proxy to uvicorn)

NGINX_CONF="$HOME/Server/config/nginx.conf"

# Check if already in prod mode
if ! grep -q "# GXML DEV MODE" "$NGINX_CONF"; then
    echo "Already in prod mode"
    exit 0
fi

# Remove dev mode marker and restore production proxy
sed -i.bak '
/# GXML DEV MODE/d
/proxy_pass http:\/\/localhost:5173;/c\
\        proxy_pass http://localhost:9004;
' "$NGINX_CONF"

sudo nginx -s reload
echo "Nginx switched to PROD mode (proxying to uvicorn on :9004)"
