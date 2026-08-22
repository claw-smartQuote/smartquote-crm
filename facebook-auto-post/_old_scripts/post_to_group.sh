#!/bin/bash
# Facebook 自動發文 - 瀏覽器版
# 需要配合 OpenClaw browser tool 使用

BROWSER_TARGET=""
POST_CONTENT=""
IMAGE_PATH=""

# 解析參數
SLOT=$1
GROUP_ID=$2
TEMPLATE_NUM=$3

if [ -z "$SLOT" ] || [ -z "$GROUP_ID" ]; then
  echo "用法: $0 <時段1-5> <群組ID> <模板1-3>"
  exit 1
fi

# AI 隨機文案
get_ai_text() {
  local date_text="📅 $(date +%Y年%m月%d日) $(date +%A)"
  
  local hour=$(date +%H)
  
  if [ "$hour" -ge 6 ] && [ "$hour" -lt 12 ]; then
    local time_text="上午時段，請注意行車安全。"
  elif [ "$hour" -ge 12 ] && [ "$hour" -lt 18 ]; then
    local time_text="下午時段，長途駕駛請定時休息。"
  else
    local time_text="晚間駕駛請開啟車燈，確保安全。"
  fi
  
  echo "$date_text $time_text 祝你旅途平安！"
}

# 模板內容
case $TEMPLATE_NUM in
  1)
    POST_CONTENT="【$(get_ai_text)】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 醫保外藥用險
✅ 12次道路救援（拖車、送油、換胎）
✅ 廣東話/國語雙語服務
✅ 免費代辦ETC
全港最平，歡迎 WhatsApp / Wechat 查詢👉🏻
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD"
    ;;
  2)
    POST_CONTENT="【$(get_ai_text)】
🧐港車北上保險多少錢？
市場行情參考：
• 交強險 + 商業第三者責任險 + 醫保外用藥
✅ 12次道路救援（拖車、送油、換胎）
• 全套低至 ¥1469 起
• 另有駕意險可加配
與香港本地保險比較：
✅ 性價比更高
✅ 保障範圍更廣
✅ 粵/國語雙語服務
立馬 WhatsApp 比較報價！📱
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD"
    ;;
  3)
    POST_CONTENT="【$(get_ai_text)】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
續保預登記享折扣
• 交強險 + 商業第三者責任險 + 醫保外用藥
✅ 12次道路救援（拖車、送油、換胎）
• 全套低至 ¥1469 起
• 另有駕意險可加配
WhatsApp 24小時報價👇
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#汽車保險 #保險報價 #續保 #港車北上 #modelS #Tesla #modelY #BYD"
    ;;
esac

# 隨機圖片
IMAGES=(
  "/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg"
  "/Users/claw/Desktop/Facebook資料夾/FB_jpeg/02.jpeg"
  "/Users/claw/Desktop/Facebook資料夾/FB_jpeg/03.jpeg"
  "/Users/claw/Desktop/Facebook資料夾/FB_jpeg/04.jpeg"
  "/Users/claw/Desktop/Facebook資料夾/FB_jpeg/05.jpeg"
)
rand_idx=$((RANDOM % 5))
IMAGE_PATH="${IMAGES[$rand_idx]}"

echo "=========================================="
echo "Facebook 自動發文"
echo "=========================================="
echo "時段: $SLOT"
echo "群組: $GROUP_ID"
echo "模板: $TEMPLATE_NUM"
echo "圖片: $IMAGE_PATH"
echo "=========================================="
echo "內容:"
echo "$POST_CONTENT"
echo "=========================================="

# 輸出指令以便下一步執行
echo ""
echo "請手動執行以下瀏覽器操作:"
echo "1. browser action=start profile=openclaw"
echo "2. browser action=navigate url=\"https://www.facebook.com/groups/$GROUP_ID\""
echo "3. 點擊發佈動態"
echo "4. 輸入內容: $POST_CONTENT"
echo "5. 上傳圖片: $IMAGE_PATH"
echo "6. 點擊發佈"
