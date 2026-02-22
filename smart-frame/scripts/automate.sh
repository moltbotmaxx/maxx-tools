#!/bin/bash
# Smart-Frame Automation Script
# Path: /Users/maxx/.openclaw/workspace/projects/maxx-tools/smart-frame/scripts/automate.sh

PROJECT_DIR="/Users/maxx/.openclaw/workspace/projects/maxx-tools/smart-frame"
DATA_FILE="$PROJECT_DIR/data.json"
HTML_FILE="$PROJECT_DIR/index.html"
SCREENSHOT_PATH="/tmp/dashboard_raw.png"
FINAL_IMAGE="$PROJECT_DIR/Dashboard_Final.png"
FTP_HOST="192.168.100.12"
FTP_PORT="2221"

echo "[$(date)] Starting Dashboard Update..."

# 1. Update data.json (using curl/python)
# (For now we use the existing python logic or direct curl)
# Weather Alajuela
WEATHER=$(curl -s "https://api.open-meteo.com/v1/forecast?latitude=10.0163&longitude=-84.2116&current_weather=true" | jq '.current_weather.temperature')
# Update last update time in HTML
sed -i '' "s/Last update: [0-9]\{2\}:[0-9]\{2\}/Last update: $(date +%H:%M)/g" "$HTML_FILE"

# 2. Tell OpenClaw to take screenshot and upload
# Since this runs as a shell command in the scheduler, we use 'openclaw invoke' 
# or we just rely on the next time the agent wakes up.
# BETTER: We use the scheduler to trigger an AGENT TURN so I do the work.

echo "[$(date)] Automation step completed."
