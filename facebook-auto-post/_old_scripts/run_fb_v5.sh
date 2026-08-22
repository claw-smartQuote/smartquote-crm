#!/bin/bash
# Facebook V5 發文腳本包裝器
# 用法: ./run_fb_v5.sh <時段> <群組起始> <群組結束>

SLOT=$1
START=$2
END=$3

# 確保 Chrome 在 debug 模式
if ! lsof -i :9222 > /dev/null 2>&1; then
  echo "啟動 Chrome debug 模式..."
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-fb-profile" &
  sleep 5
fi

# 運行 V5 腳本
cd /Users/claw/.openclaw/workspace/facebook-auto-post
node use_existing_session_v5_param.js $SLOT $START $END
