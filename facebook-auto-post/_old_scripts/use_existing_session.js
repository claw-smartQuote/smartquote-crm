/**
 * Facebook 自動發文 - 使用已登入的 Chrome  session
 * 連接到 localhost:9222 的 Chrome，發文到群組
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

// 配置
const CONFIG = {
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

// 檢查是否已發過
function hasAlreadyPosted(groupId) {
  const log = loadPostLog();
  const recentPosts = log.posts.filter(p => {
    const postTime = new Date(p.timestamp).getTime();
    const now = Date.now();
    return p.group_id === groupId && (now - postTime) < 24 * 60 * 60 * 1000;
  });
  return recentPosts.length > 0;
}

// 獲取隨機圖片
function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

// AI 隨機文案
function getAIText() {
  const dates = [
    '📅 2026年4月26日 星期日',
  ];
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。',
    '晚間駕駛請開啟車燈，確保安全。',
    '長途駕駛請注意防曬和定時休息，確保精神充沛。'
  ];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dates[0]} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
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

// 連接到已存在的 Chrome
async function connectToChrome() {
  console.log('[DEBUG] 連接到 Chrome 除錯端口...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log('[DEBUG] 已連接 Chrome');
  return browser;
}

// 發文到群組
async function postToGroup(page, group, templateNum) {
  const groupId = group.id;
  const groupName = group.name;

  if (hasAlreadyPosted(groupId)) {
    console.log(`⏭️  24小時內已發過，跳過: ${groupName}`);
    return { status: 'skipped', group_id: groupId, group_name: groupName };
  }

  console.log(`=== 準備發文到: ${groupName} ===`);

  try {
    // 導航到群組
    await page.goto(`https://www.facebook.com/groups/${groupId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // 模擬人類滾動
    await AntiBot.humanScroll(page);
    await AntiBot.pause(1000, 2000);

    // 點擊發文框 - 直接使用「建立帖子」按鈕（只在主 composer）
    let clicked = false;
    const composerSelectors = [
      'button:has-text("建立帖子")',
      'button:has-text("建立-post")',
      'div[aria-label*="建立"][role="button"]',
    ];
    
    for (const selector of composerSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          const visible = await el.isVisible();
          if (visible) {
            console.log(`[DEBUG] 找到建立帖子按鈕: ${selector}`);
            await el.click();
            clicked = true;
            await AntiBot.pause(1000, 2000);
            break;
          }
        }
      } catch (e) { continue; }
    }
    
    if (!clicked) {
      console.log(`❌ 發文失敗: 找不到建立帖子按鈕`);
      await page.screenshot({ path: `/tmp/fb_debug_${Date.now()}.png` });
      return { status: 'failed', group_id: groupId, group_name: groupName };
    }

    // 生成內容
    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    const imagePath = getRandomImage();

    // 輸入文字（使用 AntiBot 的 typeText）
    await AntiBot.typeText(page, 'div[contenteditable="true"]', content);
    await AntiBot.pause(500, 1000);

    // 上傳圖片
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(imagePath);
      console.log(`[DEBUG] 已選擇圖片: ${imagePath}`);
      await AntiBot.pause(2000, 4000);
    }

    // 點擊發布按鈕（使用 AntiBot 的 clickPublish）
    const published = await AntiBot.clickPublish(page);
    await AntiBot.pause(2000, 4000);

    // 檢測發文狀態
    const postResult = await AntiBot.detectPostStatus(page);
    console.log(`[DEBUG] 發文狀態: ${postResult.status} - ${postResult.note}`);

    if (postResult.status === 'success') {
      console.log(`✅ 發文成功: ${groupName}`);
      return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };
    } else {
      console.log(`❌ 發文失敗: ${postResult.note}`);
      return { status: postResult.status, group_id: groupId, group_name: groupName, note: postResult.note };
    }

  } catch (err) {
    console.log(`❌ 發文失敗: ${err.message}`);
    return { status: 'failed', group_id: groupId, group_name: groupName, error: err.message };
  }
}

// 主流程
async function main() {
  console.log('========== 使用已登入 Session 發文 ==========');

  let browser;
  try {
    // 連接到已存在的 Chrome
    browser = await connectToChrome();
    const contexts = browser.contexts();
    const context = contexts[0];
    const page = await context.newPage();

    // 檢查是否已登入
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`[DEBUG] 當前URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('❌ 未登入，請先在手動瀏覽器登入');
      return;
    }

    // 獲取第55-60個群組（共5個）
    const templateNum = 1;
    const targetGroups = CONFIG.groups.slice(55, 60);

    console.log(`\n========== 時段 1 ==========\n`);

    for (let i = 0; i < targetGroups.length; i++) {
      const group = targetGroups[i];
      console.log(`\n[${i + 1}/5] 群組: ${group.id}`);

      const result = await postToGroup(page, group, templateNum);
      addPostRecord(result);

      if (i < targetGroups.length - 1) {
        const waitTime = 15000 + Math.random() * 20000;
        console.log(`等待 ${(waitTime / 1000).toFixed(1)} 秒後發送下一個...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    console.log('\n========== 時段 1 完成 ==========');
    console.log('所有發文任務完成！');

  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
