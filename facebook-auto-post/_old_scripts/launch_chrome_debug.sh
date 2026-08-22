#!/bin/bash
# 啟動 Chrome 並開啟遠程調試（使用 Default profile）

CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
USER_DATA_DIR="/Users/claw/Library/Application Support/Google/Chrome"
DEBUG_PORT=9222

# 啟動 Chrome（使用 Default profile）
nohup "$CHROME_PATH" \
  --remote-debugging-port=$DEBUG_PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --profile-directory="Default" \
  "https://www.facebook.com" \
  > /tmp/chrome_debug.log 2>&1 &

echo "Chrome 啟動中，PID: $!"
echo "等待 8 秒..."
sleep 8

# 檢查是否成功
if curl -s http://127.0.0.1:$DEBUG_PORT/json/version > /dev/null 2>&1; then
  echo "✅ Chrome 啟動成功！"
  curl -s http://127.0.0.1:$DEBUG_PORT/json/version | head -5
else
  echo "❌ Chrome 啟動失敗"
  cat /tmp/chrome_debug.log
fi
