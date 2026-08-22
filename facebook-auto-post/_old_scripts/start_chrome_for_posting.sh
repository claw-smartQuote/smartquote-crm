#!/bin/bash
# Facebook 自動發文 - 啟動腳本
# 只需要運行一次，用戶完成登入後，以後就不用再做任何事

CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEBUG_PROFILE="/Users/claw/Library/Application Support/Google/Chrome_FB_Posting"
DEBUG_PORT=9222

# 創建調試用的 Profile 目錄
mkdir -p "$DEBUG_PROFILE"

echo "=========================================="
echo " Facebook 自動發文 - Chrome 啟動器"
echo "=========================================="
echo ""
echo "即將啟動 Chrome 並開啟遠程調試..."
echo ""
echo "注意："
echo "1. 只需要做一次！"
echo "2. 請在瀏覽器中登入 Facebook"
echo "3. 如果要求驗證，請完成驗證並點擊「信任此裝置」"
echo "4. 以後只需要保持這個瀏覽器窗口開著"
echo ""
read -p "按 Enter 繼續..." key

# 啟動 Chrome（使用專用 Profile + 調試端口）
nohup "$CHROME_PATH" \
  --remote-debugging-port=$DEBUG_PORT \
  --user-data-dir="$DEBUG_PROFILE" \
  --profile-directory="Profile 1" \
  "https://www.facebook.com" \
  > /tmp/fb_chrome_starter.log 2>&1 &

CHROME_PID=$!
echo "Chrome 已啟動！PID: $CHROME_PID"
echo ""
echo "等待 5 秒讓瀏覽器完全啟動..."
sleep 5

# 檢查是否成功
if curl -s http://127.0.0.1:$DEBUG_PORT/json/version > /dev/null 2>&1; then
  echo "✅ Chrome 啟動成功！"
  echo ""
  echo "=========================================="
  echo " 請在瀏覽器中完成以下操作："
  echo " 1. 登入 Facebook"
  echo " 2. 如果要求驗證，完成驗證"
  echo " 3. 點擊「信任此裝置」（這樣就不用每次驗證）"
  echo "=========================================="
  echo ""
  echo "完成後告訴我，我會測試連接！"
else
  echo "❌ Chrome 啟動失敗"
  echo "日誌："
  cat /tmp/fb_chrome_starter.log
fi
