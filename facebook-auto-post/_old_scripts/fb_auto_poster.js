/**
 * Facebook 自動發文 - 完整流程腳本 v3.1
 * 保持登入Session + 新分頁發文
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

// 配置
const CONFIG = {
  fbEmail: 'x@smartquote.cn',
  fbPassword: 'Apple123#',
  groups: JSON.parse(fs.readFileSync('./target_groups.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
  maxPostAttempts: 2,
  debugScreenshot: true,
  keepBrowserOpen: true,  // 保持瀏覽器開啟
};

// 全域瀏覽器實例
let sharedBrowser = null;
let sharedContext = null;

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

// 檢查是否已發過（只看成功/待審的，失敗的可以重試）
function hasAlreadyPosted(groupId) {
  const log = loadPostLog();
  const recentPosts = log.posts.filter(p => {
    const postTime = new Date(p.timestamp).getTime();
    const now = Date.now();
    return p.group_id === groupId && (now - postTime) < 24 * 60 * 60 * 1000
      && (p.status === 'success' || p.status === 'pending_review');
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
  const today = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。',
    '晚間駕駛請開啟車燈，確保安全。',
    '長途駕駛請注意防曬和定時休息，確保精神充沛。'
  ];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dateStr} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
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

// 初始化/獲取共享瀏覽器 - CDP 連接模式（使用已登入 session）
async function getSharedBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    console.log('[DEBUG] 重用現有瀏覽器');
    return sharedBrowser;
  }

  console.log('[DEBUG] CDP 連接 Chrome (localhost:9222)...');
  sharedBrowser = await chromium.connectOverCDP('http://localhost:9222');
  sharedContext = sharedBrowser.contexts()[0];
  console.log('[DEBUG] ✅ CDP 連接成功，使用已登入 session');
  return sharedBrowser;
}

// 登入 Facebook（使用當前上下文）
async function loginToFacebook(context) {
  console.log('[DEBUG] 開始登入 Facebook...');
  const page = await context.newPage();

  try {
    await page.goto('https://www.facebook.com', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    console.log('[DEBUG] 當前URL: ' + page.url());

    // 檢查是否已登入
    if (page.url().includes('facebook.com')) {
      // 嘗試找登入表單
      const emailInput = await page.$('input#email');
      if (emailInput) {
        console.log('[DEBUG] 找到登入表單，進行登入...');
        await emailInput.fill(CONFIG.fbEmail);
        await AntiBot.pause(300, 600);

        const passInput = await page.$('input#pass');
        if (passInput) {
          await passInput.fill(CONFIG.fbPassword);
          await AntiBot.pause(300, 600);
        }

        const loginBtn = await page.$('button[name="login"]');
        if (loginBtn) {
          await loginBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
        }
      } else {
        console.log('[DEBUG] 已登入或不需要登入');
      }
    }

    console.log('[DEBUG] 登入後URL: ' + page.url());
    console.log('[DEBUG] ✅ 登入完成');

  } catch (error) {
    console.error('[DEBUG] 登入錯誤: ' + error.message);
  } finally {
    await page.close();
  }
}

// 確保已登入
async function ensureLoggedIn() {
  const browser = await getSharedBrowser();
  if (!sharedContext) {
    sharedContext = await browser.newContext();
  }

  // 檢查是否已登入（通過訪問 Facebook）
  console.log('[DEBUG] 檢查登入狀態...');
  const tempPage = await sharedContext.newPage();
  await tempPage.goto('https://www.facebook.com', { timeout: 10000 }).catch(() => {});
  const url = tempPage.url();
  await tempPage.close();

  if (url.includes('login')) {
    console.log('[DEBUG] 需要登入');
    await loginToFacebook(sharedContext);
  } else {
    console.log('[DEBUG] 已登入，復用Session');
  }
}

// 主發文函數 v3.1 - 使用新分頁
async function postToGroup(group, templateNum) {
  let page = null;

  try {
    console.log(`\n=== 準備發文到: ${group.name} (ID: ${group.id}) ===`);

    // 檢查是否已發過
    if (hasAlreadyPosted(group.id)) {
      console.log(`[SKIP] 24小時內已在該群組發過文，跳過`);
      return { success: true, status: 'skipped', note: '24小時內已發過' };
    }

    // 確保有共享瀏覽器且已登入
    await ensureLoggedIn();

    // 在新分頁發文
    console.log('[DEBUG] 開啟新分頁...');
    page = await sharedContext.newPage();

    // 1. 導航到群組
    console.log('[DEBUG] 導航到群組...');
    const navResult = await page.goto(`https://www.facebook.com/groups/${group.id}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    console.log(`[DEBUG] 導航結果: ${navResult.status()} | URL: ${page.url()}`);

    // 檢查是否被重定向到登入頁
    if (page.url().includes('login')) {
      throw new Error('Session 過期，需要重新登入');
    }

    await AntiBot.waitPageLoad(page);

    // 檢查群組狀態（未加入/審核中）
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (pageText.includes('你的群組加入申請正在審核中') || pageText.includes('加入申請正在審核')) {
      throw new Error('群組加入申請審核中，無法發文');
    }
    if (pageText.includes('加入群組') && !pageText.includes('發佈')) {
      throw new Error('尚未加入此群組，無法發文');
    }

    // 2. 滾動模擬瀏覽
    console.log('[DEBUG] 模擬瀏覽...');
    await AntiBot.randomScrolling(page);

    // 3. 打開發文框
    console.log('[DEBUG] 打開發文框...');
    await AntiBot.clickPostBox(page);
    await AntiBot.pause(1500, 3000);

    // 4. 檢查可編輯區域
    const editableDiv = await page.$('div[contenteditable="true"]');
    console.log(`[DEBUG] 可編輯div存在: ${!!editableDiv}`);

    if (!editableDiv) {
      if (CONFIG.debugScreenshot) {
        await page.screenshot({ path: `/tmp/fb_debug_${group.id}_no_editor.png` });
      }
      throw new Error('找不到可編輯區域');
    }

    // 5. 輸入內容（用 JS 注入，更快更穩定）
    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    console.log('[DEBUG] 輸入內容...');
    
    // Use JS to set content directly (faster than typing)
    const editableDivs = await page.$$('div[contenteditable="true"]');
    const targetDiv = editableDivs[editableDivs.length - 1]; // Last one is usually the dialog
    if (targetDiv) {
      await targetDiv.click();
      await AntiBot.pause(500, 1000);
      // Type using keyboard (faster delay)
      await page.keyboard.type(content, { delay: 10 });
    }
    console.log('[DEBUG] 內容輸入完成');

    // 檢查輸入內容
    const contentAfter = await page.evaluate(() => {
      const divs = document.querySelectorAll('div[contenteditable="true"]');
      const last = divs[divs.length - 1];
      return last ? last.textContent : '';
    });
    console.log(`[DEBUG] 輸入後內容長度: ${contentAfter.length} 字`);

    if (contentAfter.length < 10) {
      console.log('[DEBUG] 內容可能輸入失敗，嘗試替代方式...');
      await page.evaluate((text) => {
        const divs = document.querySelectorAll('div[contenteditable="true"]');
        const last = divs[divs.length - 1];
        if (last) {
          last.focus();
          document.execCommand('insertText', false, text);
        }
      }, content);
    }

    await AntiBot.pause(1500, 3000);

    // Wait for link preview to finish loading (if any)
    console.log('[DEBUG] 等待連結預覽...');
    for (let i = 0; i < 10; i++) {
      const isLoading = await page.evaluate(() => {
        return document.body.innerText.includes('正在建立連結預覽') || document.body.innerText.includes('Building link preview');
      });
      if (!isLoading) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    // 6. 上傳圖片（用 fileChooser 方式，更可靠）
    console.log('[DEBUG] 上傳圖片...');
    const imagePath = getRandomImage();
    console.log(`[DEBUG] 圖片路徑: ${imagePath}`);

    let uploaded = false;
    try {
      // 找帖子 dialog 入面嘅相片按鈕
      const photoBtn = page.locator('[role="dialog"]:not([aria-label="Messenger"]) [aria-label*="相片"], [role="dialog"]:not([aria-label="Messenger"]) [aria-label*="影片"], [role="dialog"]:not([aria-label="Messenger"]) [aria-label*="Photo"], [role="dialog"]:not([aria-label="Messenger"]) [aria-label*="media"]').first();
      const photoExists = await photoBtn.count();
      if (photoExists) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          photoBtn.click()
        ]);
        await fileChooser.setFiles(imagePath);
        uploaded = true;
        console.log('[DEBUG] 圖片已附加 (fileChooser)');
        await AntiBot.pause(3000, 5000);
      } else {
        console.log('[DEBUG] 找不到相片按鈕，嘗試 fallback...');
        // Fallback: 直接用 input[type=file]
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(imagePath);
          uploaded = true;
          console.log('[DEBUG] 圖片已設定 (fallback input)');
          await AntiBot.pause(3000, 5000);
        } else {
          console.log('[DEBUG] 無法找到檔案上傳方式');
        }
      }
    } catch (e) {
      console.log(`[DEBUG] 圖片上傳失敗: ${e.message.substring(0, 80)}`);
    }
    if (!uploaded) console.log('[DEBUG] ⚠️ 圖片未附加');

    // 7. 點擊發佈
    console.log('[DEBUG] 點擊發佈...');
    await AntiBot.clickPublish(page);
    await AntiBot.pause(2000, 4000);

    // 8. 檢測發文狀態
    console.log('[DEBUG] 檢測發文狀態...');
    const postResult = await AntiBot.detectPostStatus(page);
    console.log(`[DEBUG] 發文狀態: ${postResult.status} - ${postResult.note}`);

    // 9. 截圖保存
    if (CONFIG.debugScreenshot) {
      await page.screenshot({
        path: `/tmp/fb_result_${group.id}_${Date.now()}.png`,
        fullPage: false
      });
      console.log('[DEBUG] 結果截圖已保存');
    }

    // 記錄發文
    const record = {
      id: `post_${Date.now()}`,
      timestamp: new Date().toISOString(),
      group_id: group.id,
      group_name: group.name,
      group_url: `https://www.facebook.com/groups/${group.id}`,
      template: templateNum,
      ai_text: aiText,
      image: imagePath.split('/').pop(),
      status: postResult.status,
      note: postResult.note
    };
    addPostRecord(record);

    console.log(`✅ 發文完成！狀態: ${postResult.status} | 備註: ${postResult.note}`);

    // 10. 關閉分頁（保持瀏覽器）
    console.log('[DEBUG] 關閉分頁...');
    await page.close();
    page = null;

    return { success: true, ...postResult };

  } catch (error) {
    console.error(`❌ 發文失敗: ${error.message}`);

    if (page && CONFIG.debugScreenshot) {
      try {
        await page.screenshot({ path: `/tmp/fb_error_${group.id}_${Date.now()}.png` });
      } catch (e) {}
    }

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

    if (page) {
      await page.close().catch(() => {});
    }

    return { success: false, status: 'failed', note: error.message };
  }
}

// 發文時段任務
async function runSlot(slotNum, groups) {
  console.log(`\n========== 執行時段 ${slotNum} ==========`);

  const templateNum = ((slotNum - 1) % 3) + 1;
  const startIdx = (slotNum - 1) * 5;
  const slotGroups = groups.slice(startIdx, startIdx + 5);

  console.log(`[INFO] 時段 ${slotNum} 使用模板 ${templateNum}`);
  console.log(`[INFO] 目標群組: ${slotGroups.map(g => g.name).join(', ')}`);

  // 確保已登入（第一個帖子前）
  await ensureLoggedIn();

  for (let i = 0; i < slotGroups.length; i++) {
    const group = slotGroups[i];
    console.log(`\n[${i + 1}/5] 群組: ${group.name}`);

    const result = await postToGroup(group, templateNum);

    // 根據結果調整間隔
    let delay;
    if (result.status === 'success') {
      delay = Math.floor(Math.random() * 25000) + 15000;
    } else if (result.status === 'skipped') {
      delay = Math.floor(Math.random() * 10000) + 5000;
    } else {
      delay = Math.floor(Math.random() * 15000) + 10000;
    }

    console.log(`等待 ${(delay/1000).toFixed(1)} 秒後發送下一個...`);
    await new Promise(r => setTimeout(r, delay));
  }

  console.log(`\n========== 時段 ${slotNum} 完成 ==========`);
}

// 關閉共享瀏覽器
async function closeSharedBrowser() {
  if (sharedBrowser) {
    console.log('[DEBUG] 關閉共享瀏覽器...');
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
    sharedContext = null;
  }
}

// 檢查並執行當前時段
async function checkAndExecute() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour * 60 + minute;

  const slots = [
    { slot: 1, time: 7 * 60, name: '07:00' },
    { slot: 2, time: 8 * 60 + 30, name: '08:30' },
    { slot: 3, time: 10 * 60, name: '10:00' },
    { slot: 4, time: 11 * 60 + 30, name: '11:30' },
    { slot: 5, time: 13 * 60, name: '13:00' },
  ];

  for (const s of slots) {
    if (Math.abs(currentTime - s.time) <= 5) {
      console.log(`\n🎯 發現時段 ${s.slot} (${s.name}) 的觸發！`);
      await runSlot(s.slot, CONFIG.groups);
      await closeSharedBrowser();
      return;
    }
  }

  console.log('目前不在發文時段內');
  await closeSharedBrowser();
}

// 導出
module.exports = {
  postToGroup,
  runSlot,
  checkAndExecute,
  ensureLoggedIn,
  closeSharedBrowser,
  CONFIG
};

// 直接運行
if (require.main === module) {
  checkAndExecute();
}
