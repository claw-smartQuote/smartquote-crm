/**
 * 強制立即發文腳本
 * 繞過時段檢查，直接發布到前5個群組
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

// 配置
const CONFIG = {
  fbEmail: '萊to@smartquote.cn',
  fbPassword: 'Pin4fb123',
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

// 載入發文日誌
function loadPostLog() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.postLogFile, 'utf8'));
  } catch {
    return { posts: [], statistics: { success: 0, pending_review: 0, requires_question: 0, failed: 0 } };
  }
}

// 保存發文日誌
function savePostLog(log) {
  fs.writeFileSync(CONFIG.postLogFile, JSON.stringify(log, null, 2));
}

// 添加發文記錄
function addPostRecord(post) {
  const log = loadPostLog();
  log.posts.push(post);
  log.total_posts = log.posts.length;
  log.statistics[post.status] = (log.statistics[post.status] || 0) + 1;
  log.last_updated = new Date().toISOString();
  savePostLog(log);
}

// 獲取隨機圖片
function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

// AI 隨機文案
function getAIText() {
  const dates = [
    '📅 2026年4月14日 星期二',
  ];
  
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。'
  ];
  
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  
  const date = dates[0];
  const weather_text = weather[Math.floor(Math.random() * weather.length)];
  const greeting_text = greeting[Math.floor(Math.random() * greeting.length)];
  
  return `${date} ${weather_text} ${greeting_text}`;
}

// 模板內容
function getTemplate(num, aiText) {
  const templates = {
    1: `【${aiText}】
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
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
    
    2: `【${aiText}】
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
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
    
    3: `【${aiText}】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
續保預登記享折扣
• 交強險 + 商業第三者責任險 + 醫保外用藥
✅ 12次道路救援（拖車、送油、換胎）
• 全套低至 ¥1469 起
• 另有駕意險可加配
WhatsApp 24小時報價👇
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#汽車保險 #保險報價 #續保 #港車北上 #modelS #Tesla #modelY #BYD`
  };
  
  return templates[num] || templates[1];
}

// 主發文函數
async function postToGroup(group, templateNum) {
  let browser = null;
  
  try {
    console.log(`\n=== 準備發文到: ${group.name} ===`);
    
    // 啟動瀏覽器
    browser = await chromium.launch({ 
      headless: false,
      args: ['--disable-bromium-compositor', '--disable-dev-shm-usage']
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 1. 導航到群組
    console.log('導航到群組...');
    await page.goto(`https://www.facebook.com/groups/${group.id}`, { waitUntil: 'networkidle' });
    await AntiBot.waitPageLoad(page);
    
    // 2. 滾動模擬瀏覽
    console.log('模擬瀏覽...');
    await AntiBot.randomScrolling(page);
    
    // 3. 點擊發文框
    console.log('點擊發文框...');
    const postBox = await page.$('button:has-text("寫點內容")');
    if (!postBox) {
      throw new Error('找不到發文框');
    }
    await AntiBot.humanClick(page, 'button:has-text("寫點內容")');
    await AntiBot.pause(1000, 2000);
    
    // 4. 輸入內容
    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    console.log('輸入內容...');
    await AntiBot.typeText(page, 'div[contenteditable="true"]', content);
    await AntiBot.pause(500, 1000);
    
    // 5. 上傳圖片
    console.log('上傳圖片...');
    const imagePath = getRandomImage();
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(imagePath);
      await AntiBot.pause(2000, 3000);
    }
    
    // 6. 點擊發佈
    console.log('點擊發佈...');
    await AntiBot.humanClick(page, 'button:has-text("發佈")');
    await AntiBot.pause(3000, 5000);
    
    // 7. 檢查結果
    let status = 'success';
    let note = '直接發佈成功';
    
    // 檢查是否有審批提示
    const pendingReview = await page.$('text=感謝你建立帖子');
    if (pendingReview) {
      status = 'pending_review';
      note = '需要管理員審批';
    }
    
    // 檢查是否需要回答問題
    const question = await page.$('text=回答這些問題');
    if (question) {
      status = 'requires_question';
      note = '需要回答群組問題';
    }
    
    // 記錄發文
    addPostRecord({
      id: `post_${Date.now()}`,
      timestamp: new Date().toISOString(),
      group_id: group.id,
      group_name: group.name,
      group_url: `https://www.facebook.com/groups/${group.id}`,
      template: templateNum,
      ai_text: aiText,
      image: imagePath.split('/').pop(),
      status: status,
      note: note
    });
    
    console.log(`✅ 發文完成！狀態: ${status}`);
    
    // 8. 關閉瀏覽器（釋放記憶體）
    console.log('關閉瀏覽器，釋放記憶體...');
    await browser.close();
    browser = null;
    
    return { success: true, status, note };
    
  } catch (error) {
    console.error('❌ 發文失敗:', error.message);
    
    // 記錄失敗
    addPostRecord({
      id: `post_${Date.now()}`,
      timestamp: new Date().toISOString(),
      group_id: group.id,
      group_name: group.name,
      group_url: `https://www.facebook.com/groups/${group.id}`,
      template: templateNum,
      ai_text: getAIText(),
      image: getRandomImage().split('/').pop(),
      status: 'failed',
      note: error.message
    });
    
    // 確保關閉瀏覽器
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    
    return { success: false, status: 'failed', note: error.message };
  }
}

// 執行時段 1（前5個群組）
async function runSlot1() {
  console.log('\n========== 強制執行時段 1 ==========');
  
  const templateNum = 1;
  const startIdx = 0;
  const slotGroups = CONFIG.groups.slice(startIdx, startIdx + 5);
  
  for (let i = 0; i < slotGroups.length; i++) {
    const group = slotGroups[i];
    console.log(`\n[${i + 1}/5] 群組: ${group.name}`);
    
    const result = await postToGroup(group, templateNum);
    
    // 發文間隨機間隔（10-30秒）
    if (i < slotGroups.length - 1) {
      const delay = Math.floor(Math.random() * 20000) + 10000;
      console.log(`等待 ${delay/1000} 秒後發送下一個...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  console.log('\n========== 時段 1 完成 ==========');
}

// 運行
runSlot1().then(() => {
  console.log('所有發文任務完成！');
  process.exit(0);
}).catch(e => {
  console.error('執行錯誤:', e);
  process.exit(1);
});
