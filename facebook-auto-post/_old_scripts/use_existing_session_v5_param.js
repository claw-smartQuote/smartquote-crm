/**
 * Facebook 自動發文 v5 - 參數版
 * 支援指定起始群組和數量
 * 用法: node use_existing_session_v5_param.js [startIndex] [count]
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

// 從命令行參數讀取起始索引和數量
const startIndex = parseInt(process.argv[2]) || 0;
const postCount = parseInt(process.argv[3]) || 5;

function loadPostLog() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.postLogFile, 'utf8'));
  } catch {
    return { posts: [], statistics: { success: 0, pending_review: 0, requires_question: 0, failed: 0 } };
  }
}

function savePostLog(log) {
  fs.writeFileSync(CONFIG.postLogFile, JSON.stringify(log, null, 2));
}

function addPostRecord(post) {
  const log = loadPostLog();
  log.posts.push(post);
  log.total_posts = log.posts.length;
  log.statistics[post.status] = (log.statistics[post.status] || 0) + 1;
  log.last_updated = new Date().toISOString();
  savePostLog(log);
}

function hasAlreadyPosted(groupId) {
  const log = loadPostLog();
  const recentPosts = log.posts.filter(p => {
    const postTime = new Date(p.timestamp).getTime();
    const now = Date.now();
    return p.group_id === groupId && (now - postTime) < 24 * 60 * 60 * 1000;
  });
  return recentPosts.length > 0;
}

function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

function getAIText() {
  const today = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。',
    '晚間駕駛請開啟車燈，確保安全。',
  ];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dateStr} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
}

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

async function connectToChrome() {
  console.log('[Step 1] 連接 Chrome...');
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('[Step 1] ✅ 已連接');
    return browser;
  } catch (err) {
    console.log(`[Step 1] ❌ 連接失敗: ${err.message}`);
    throw err;
  }
}

async function postToGroup(page, group, templateNum) {
  const groupId = group.id;
  const groupName = group.name;

  try {
    // 檢查是否已發過
    if (hasAlreadyPosted(groupId)) {
      console.log(`[跳過] ${groupName} - 24小時內已發過`);
      return { status: 'skipped', group_id: groupId, group_name: groupName, reason: '24小時內已發過' };
    }

    // Step 2: 導航到群組
    console.log(`[Step 2] 導航到群組: ${groupName}`);
    await page.goto(`https://www.facebook.com/groups/${groupId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await AntiBot.pause(3000, 5000);

    // Step 3: 找到發文框
    console.log(`[Step 3] 找發文框...`);
    const writeBox = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if ((s.textContent.includes('寫點內容') || s.textContent.includes('Write something')) && s.offsetParent !== null) {
          return true;
        }
      }
      return false;
    });

    if (!writeBox) {
      console.log(`❌ 找不到發文框`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到發文框' };
    }

    // Step 4: 點擊發文框
    console.log(`[Step 4] 點擊發文框...`);
    await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if ((s.textContent.includes('寫點內容') || s.textContent.includes('Write something')) && s.offsetParent !== null) {
          s.click();
          return true;
        }
      }
      return false;
    });
    await AntiBot.pause(2000, 3000);

    // Step 5: 找到彈出視窗的文字輸入區
    console.log(`[Step 5] 找彈出視窗輸入區...`);
    const editor = await page.evaluate(() => {
      const editables = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]');
      for (const el of editables) {
        if (el.offsetParent !== null) {
          el.focus();
          return true;
        }
      }
      return false;
    });

    if (!editor) {
      console.log(`❌ 找不到彈出視窗輸入區`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到彈出視窗輸入區' };
    }

    // Step 6: 輸入內容
    console.log(`[Step 6] 輸入內容...`);
    const content = getTemplate(templateNum, getAIText());
    await AntiBot.humanType(page, content);
    await AntiBot.pause(1000, 2000);

    // Step 7: 上傳圖片
    console.log(`[Step 7] 上傳圖片...`);
    const image = getRandomImage();
    try {
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        await fileInput.setInputFiles(image);
        console.log(`[Step 7] ✅ 已上傳圖片: ${image}`);
        await AntiBot.pause(3000, 5000);
      }
    } catch (e) {
      console.log(`[Step 7] ⚠️ 圖片上傳失敗: ${e.message}`);
    }

    // Step 8: 點擊發佈
    console.log(`[Step 8] 點擊發佈...`);
    let published = false;
    const buttons = await page.$$('div[role="button"]');
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && (text.includes('發佈') || text.includes('Post') || text.includes('發布'))) {
        await btn.click();
        published = true;
        console.log(`[Step 8] ✅ 已點擊發佈`);
        break;
      }
    }

    if (!published) {
      console.log(`❌ 找不到發佈按鈕`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到發佈按鈕' };
    }

    // Step 9: 等待結果
    console.log(`[Step 9] 等待結果...`);
    await AntiBot.pause(4000, 6000);

    // Step 10: 檢測結果
    const modalGone = await page.evaluate(() => {
      const editables = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]');
      let visibleCount = 0;
      for (const el of editables) {
        if (el.offsetParent !== null) visibleCount++;
      }
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if (s.textContent.includes('寫點內容') && s.offsetParent !== null) {
          return true;
        }
      }
      return visibleCount === 0;
    });

    if (published && modalGone) {
      console.log(`✅ 發文成功: ${groupName}`);
      return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };
    } else if (published) {
      console.log(`✅ 發文已提交: ${groupName}`);
      return { status: 'pending_review', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };
    } else {
      console.log(`❌ 發文失敗: 未能點擊發佈`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '未能點擊發佈' };
    }

  } catch (err) {
    console.log(`❌ 發文失敗: ${err.message}`);
    try {
      await page.screenshot({ path: `/tmp/fb_error_${Date.now()}.png` });
    } catch (e) {}
    return { status: 'failed', group_id: groupId, group_name: groupName, error: err.message };
  }
}

async function main() {
  console.log('========== Facebook 自動發文 v5 (參數版) ==========');
  console.log(`起始索引: ${startIndex}, 數量: ${postCount}`);

  let browser;
  try {
    browser = await connectToChrome();
    const contexts = browser.contexts();
    const context = contexts[0];
    const page = await context.newPage();

    page.on('dialog', async dialog => {
      console.log(`[DEBUG] 對話框: ${dialog.message()}`);
      try {
        await dialog.accept();
      } catch (e) {
        console.log(`[DEBUG] 對話框處理失敗: ${e.message}`);
      }
    });

    // 防止 dialog 競態條件導致未捕獲異常崩潰
    process.on('unhandledRejection', (reason) => {
      if (reason && reason.message && reason.message.includes('handleJavaScriptDialog')) {
        console.log(`[DEBUG] 忽略 dialog 競態異常`);
        return;
      }
      console.error('Unhandled rejection:', reason);
    });

    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`[DEBUG] 當前URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('❌ 未登入');
      return;
    }

    // 獲取要發送的群組
    const templateNum = Math.floor(Math.random() * 3) + 1;
    const targetGroups = CONFIG.groups.slice(startIndex, startIndex + postCount);

    console.log(`\n========== 開始發文 (${targetGroups.length} 個群組) ==========\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetGroups.length; i++) {
      const group = targetGroups[i];
      console.log(`\n[${i + 1}/${targetGroups.length}] 群組: ${group.id} (${group.name}) [${group.category}]`);

      const result = await postToGroup(page, group, templateNum);
      addPostRecord(result);

      if (result.status === 'success' || result.status === 'pending_review') {
        successCount++;
      } else {
        failCount++;
      }

      if (i < targetGroups.length - 1) {
        const waitTime = 15000 + Math.random() * 20000;
        console.log(`等待 ${(waitTime / 1000).toFixed(1)} 秒後發送下一個...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    console.log(`\n========== 發文完成 ==========`);
    console.log(`成功: ${successCount}, 失敗: ${failCount}`);

  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
