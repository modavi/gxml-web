#!/bin/bash
cd /Users/morgan/Projects/gxml-web
source venv/bin/activate
exec uvicorn gxml_web.app:app --host 0.0.0.0 --port 9004
