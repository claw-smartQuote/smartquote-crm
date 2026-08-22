#!/bin/bash
# Facebook 自動發文腳本
# 每日 5 個時段 × 5 個群組 = 25 個帖子/天

# 確保在正確的目錄執行
cd ~/.openclaw/workspace/facebook-auto-post

# 設置日誌
LOG_FILE="/tmp/fb_auto_post_$(date +%Y%m%d).log"

# 讀取群組列表
GROUPS_FILE="target_groups_clean.json"

# 圖片目錄
IMAGE_DIR="/Users/claw/Desktop/Facebook資料夾/FB_jpeg"

# WhatsApp 連結
WA_LINK="https://api.whatsapp.com/send?phone=85221101144"
WA_PHONE="85221101144"

# AI 隨機文案函數
get_ai_text() {
  local today=$(date +%Y年%m月%d日)
  local weekday=$(date +%A)
  local dates=(
    "📅 $today $weekday"
  )
  
  local weather=(
    "駕駛北上，記得檢查車況，確保行車安全。"
    "路面濕滑，請注意車距，減速慢行。"
    "氣溫上升，長途駕駛請注意防曬和定時休息。"
  )
  
  local greeting=(
    "祝你旅途平安！"
    "願您一路順風！"
    "出行順利！"
  )
  
  # 隨機選擇
  local date_idx=$((RANDOM % ${#dates[@]}))
  local weather_idx=$((RANDOM % ${#weather[@]}))
  local greeting_idx=$((RANDOM % ${#greeting[@]}))
  
  echo "${dates[$date_idx]} ${weather[$weather_idx]} ${greeting[$greeting_idx]}"
}

# 模板內容
TEMPLATE_1="【AI隨機文案】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 醫保外藥用險
✅ 12次道路救援（拖車、送油、換胎）
✅ 廣東話/國語雙語服務
✅ 免費代辦ETC
全港最平，歡迎 WhatsApp / Wechat 查詢👉🏻
$WA_LINK
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD"

TEMPLATE_2="【AI隨機文案】
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
$WA_LINK
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD"

TEMPLATE_3="【AI隨機文案】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
續保預登記享折扣
• 交強險 + 商業第三者責任險 + 醫保外用藥
✅ 12次道路救援（拖車、送油、換胎）
• 全套低至 ¥1469 起
• 另有駕意險可加配
WhatsApp 24小時報價👇
$WA_LINK
📞 94924444
#汽車保險 #保險報價 #續保 #港車北上 #modelS #Tesla #modelY #BYD"

# 隨機選擇圖片
get_random_image() {
  local images=("$IMAGE_DIR/01.jpeg" "$IMAGE_DIR/02.jpeg" "$IMAGE_DIR/03.jpeg" "$IMAGE_DIR/04.jpeg" "$IMAGE_DIR/05.jpeg")
  local idx=$((RANDOM % 5))
  echo "${images[$idx]}"
}

# 獲取模板
get_template() {
  local idx=$1
  case $idx in
    1) echo "$TEMPLATE_1" ;;
    2) echo "$TEMPLATE_2" ;;
    3) echo "$TEMPLATE_3" ;;
    *) echo "$TEMPLATE_1" ;;
  esac
}

# 發文到單個群組
post_to_group() {
  local group_id=$1
  local template_num=$2
  local ai_text=$(get_ai_text)
  local image=$(get_random_image)
  
  # 替換【AI隨機文案】為實際文案
  local template=$(get_template $template_num)
  local post_content="${template//【AI隨機文案】/$ai_text}"
  
  echo "[$(date)] 準備發文到群組: $group_id" >> "$LOG_FILE"
  echo "模板: $template_num" >> "$LOG_FILE"
  echo "圖片: $image" >> "$LOG_FILE"
  echo "內容預覽: ${post_content:0:100}..." >> "$LOG_FILE"
  
  # 這裡需要調用浏览器發文
  # 實際發文時需要用 browser action
}

# 根據時段獲取群組
get_groups_for_slot() {
  local slot=$1
  local all_groups=$(cat "$GROUPS_FILE" | jq -r '.groups[:25][] | "\(.id)"')
  
  # 每個時段5個群組
  local start_idx=$(( (slot - 1) * 5 ))
  local end_idx=$((start_idx + 4))
  
  echo "$all_groups" | sed -n "$((start_idx + 1)),$((end_idx + 1))p"
}

# 主邏輯
echo "=== Facebook 自動發文開始 ===" >> "$LOG_FILE"
echo "時間: $(date)" >> "$LOG_FILE"

# 讀取目前時段
CURRENT_HOUR=$(date +%H)
CURRENT_MIN=$(date +%M)
CURRENT_TIME=$((CURRENT_HOUR * 60 + CURRENT_MIN))

# 定義發文時段（分鐘）
declare -A SLOTS
SLOTS[1]="07:00"  # 420 mins
SLOTS[2]="08:30"  # 510 mins
SLOTS[3]="10:00"  # 600 mins
SLOTS[4]="11:30"  # 690 mins
SLOTS[5]="13:00"  # 780 mins

# 轉換為分鐘
for i in 1 2 3 4 5; do
  hour=$(echo "${SLOTS[$i]}" | cut -d: -f1)
  min=$(echo "${SLOTS[$i]}" | cut -d: -f2)
  SLOTS_MINS[$i]=$((hour * 60 + min))
done

# 檢查每個時段
for i in 1 2 3 4 5; do
  slot_time=${SLOTS_MINS[$i]}
  
  # 如果係目前時段 +- 5分鐘內
  if [ $CURRENT_TIME -ge $((slot_time - 5)) ] && [ $CURRENT_TIME -le $((slot_time + 5)) ]; then
    echo "=== 執行時段 $i (${SLOTS[$i]}) ===" >> "$LOG_FILE"
    
    # 計算模板
    template_num=$(( (i % 3) + 1 ))
    
    # 獲取該時段群組
    groups=$(get_groups_for_slot $i)
    
    # 逐個發文
    idx=0
    for group_id in $groups; do
      post_to_group "$group_id" "$template_num"
      sleep 3  # 避免發文太快
      idx=$((idx + 1))
    done
    
    echo "時段 $i 完成: 發文 $idx 篇" >> "$LOG_FILE"
  fi
done

echo "=== Facebook 自動發文結束 ===" >> "$LOG_FILE"
