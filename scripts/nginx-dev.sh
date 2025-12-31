#!/bin/bash
# Switch nginx to development mode (proxy to Vite dev server)

NGINX_CONF="$HOME/Server/config/nginx.conf"

# Check if already in dev mode
if grep -q "# GXML DEV MODE" "$NGINX_CONF"; then
    echo "Already in dev mode"
    exit 0
fi

# Replace production block with dev block
sed -i.bak '
/# GXML Web Viewer - HTTPS/,/^}$/ {
    /server_name gxml.modavi.ca;/a\
\    # GXML DEV MODE
    /proxy_pass http:\/\/localhost:9004;/c\
\        proxy_pass http://localhost:5173;
}
' "$NGINX_CONF"

sudo nginx -s reload
echo "Nginx switched to DEV mode (proxying to Vite on :5173)"
