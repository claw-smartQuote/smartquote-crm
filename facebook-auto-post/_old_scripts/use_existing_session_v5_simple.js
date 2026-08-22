/**
 * Facebook 自動發文 v5 - 簡化版
 * 10 步流程 + 關閉網頁 + 跳過失敗群組
 * 2026-08-10 更新
 */

const { chromium } = require('playwright');
const fs = require('fs');

// 讀取已加入群組列表
const joinedData = JSON.parse(fs.readFileSync('./fb_groups_joined_integrated.json', 'utf8'));
const allGroups = [];
for (const category of Object.values(joinedData.by_category)) {
  if (category.groups) {
    allGroups.push(...category.groups);
  }
}

const CONFIG = {
  groups: allGroups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

// 從命令行獲取參數
const args = process.argv.slice(2);
const slotNum = parseInt(args[0]) || 1;
const groupStart = parseInt(args[1]) || 0;
const groupEnd = parseInt(args[2]) || 5;
const templateNum = ((slotNum - 1) % 3) + 1;

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

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function postToGroup(page, group, templateNum) {
  const groupId = group.id;
  const groupName = group.name;

  if (hasAlreadyPosted(groupId)) {
    console.log(`⏭️  24小時內已發過，跳過: ${groupName}`);
    return { status: 'skipped', group_id: groupId, group_name: groupName };
  }

  console.log(`=== 準備發文到: ${groupName} ===`);

  try {
    // Step 1: 導航到群組
    console.log('[Step 1] 導航到群組頁面...');
    await page.goto(`https://www.facebook.com/groups/${groupId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Step 2: 滾到頂部
    console.log('[Step 2] 滾到頂部...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Step 3: 點擊「寫點內容」(只用一次點擊)
    console.log('[Step 3] 點擊「寫點內容」...');
    let composerClicked = false;
    try {
      const el = page.locator('span:has-text("寫點內容")').first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click({ timeout: 5000 });
        composerClicked = true;
        console.log('[Step 3] ✅ 已點擊「寫點內容」');
      }
    } catch (e) {}

    if (!composerClicked) {
      console.log('❌ 找不到「寫點內容」，跳過此群組');
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到寫點內容' };
    }

    // Step 4: 等待模態框
    console.log('[Step 4] 等待模態框...');
    await page.waitForTimeout(3000);

    // Step 5: 找輸入框 (找不到就跳過)
    console.log('[Step 5] 找輸入框...');
    let inputEl = null;
    try {
      inputEl = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) {
          const editable = dialog.querySelector('div[contenteditable="true"][data-lexical-editor="true"]')
                        || dialog.querySelector('div[contenteditable="true"][role="textbox"]')
                        || dialog.querySelector('div[contenteditable="true"]');
          if (editable) { editable.focus(); editable.click(); return 'found'; }
        }
        return null;
      });
    } catch (e) {}

    if (!inputEl) {
      console.log('❌ 找不到輸入框，跳過此群組');
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到輸入框' };
    }
    console.log('[Step 5] ✅ 找到輸入框');

    await randomDelay(500, 1000);

    // Step 6: 先上傳圖片
    console.log('[Step 6] 上傳圖片...');
    const fileInputs = await page.$$('input[type="file"]');
    if (fileInputs.length > 0) {
      const imagePath = getRandomImage();
      await fileInputs[fileInputs.length - 1].setInputFiles(imagePath);
      console.log(`[Step 6] ✅ 已選擇圖片: ${imagePath}`);
      await randomDelay(4000, 6000);
    } else {
      console.log('[Step 6] ⚠️ 找不到 file input，跳過圖片');
    }

    // Step 7: 輸入文字
    console.log('[Step 7] 輸入文字...');
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const editable = dialog.querySelector('div[contenteditable="true"]');
        if (editable) { editable.focus(); editable.click(); }
      }
    });
    await randomDelay(500, 1000);

    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    await page.keyboard.type(content, { delay: 30 });
    console.log(`[Step 7] ✅ 已輸入 ${content.length} 字`);
    await randomDelay(1000, 2000);

    // Step 8: 等待預覽載入
    console.log('[Step 8] 等待預覽載入...');
    await page.waitForTimeout(2000);

    // Step 9: 點擊藍色「發佈」按鈕
    console.log('[Step 9] 點擊「發佈」...');
    let published = await page.evaluate(() => {
      const allBtns = document.querySelectorAll('div[role="button"], button');
      let bestBtn = null;
      let bestY = Infinity;
      for (const b of allBtns) {
        const text = b.textContent.trim();
        if ((text === '發佈' || text === '发布' || text === 'Post') && b.offsetParent !== null) {
          const rect = b.getBoundingClientRect();
          if (rect.y < bestY && rect.y > 0) {
            bestBtn = b;
            bestY = rect.y;
          }
        }
      }
      if (bestBtn) { bestBtn.click(); return true; }
      return false;
    });

    if (published) {
      console.log('[Step 9] ✅ 點擊「發佈」成功');
    } else {
      console.log('[Step 9] ❌ 未能點擊發佈');
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '未能點擊發佈' };
    }

    // Step 10: 等待發文完成後關閉網頁
    await randomDelay(4000, 6000);
    console.log('[Step 10] 關閉網頁...');
    await page.goto('about:blank');
    console.log(`✅ 發文成功: ${groupName}`);
    return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };

  } catch (err) {
    console.log(`❌ 發文失敗: ${err.message}`);
    try {
      await page.goto('about:blank');
    } catch (e) {}
    return { status: 'failed', group_id: groupId, group_name: groupName, error: err.message };
  }
}

async function main() {
  console.log(`========== Facebook V5 簡化版 ==========`);
  console.log(`時段: ${slotNum}, 群組: ${groupStart}-${groupEnd}, 模板: ${templateNum}`);

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    const context = contexts[0];
    const page = await context.newPage();

    page.on('dialog', async dialog => {
      try { await dialog.accept(); } catch (e) {}
    });

    // 檢查登入狀態
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) {
      console.log('❌ 未登入');
      return;
    }
    console.log('✅ 已登入 Facebook');

    const targetGroups = CONFIG.groups.slice(groupStart, groupEnd);
    console.log(`\n========== 時段 ${slotNum} (${targetGroups.length} 個群組) ==========\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetGroups.length; i++) {
      const group = targetGroups[i];
      console.log(`\n[${i + 1}/${targetGroups.length}] 群組: ${group.id} (${group.name})`);

      const result = await postToGroup(page, group, templateNum);
      addPostRecord(result);

      if (result.status === 'success') successCount++;
      else if (result.status === 'failed') failCount++;

      if (i < targetGroups.length - 1) {
        const waitTime = 15000 + Math.random() * 20000;
        console.log(`等待 ${(waitTime / 1000).toFixed(1)} 秒後發送下一個...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    console.log(`\n========== 時段 ${slotNum} 完成 ==========`);
    console.log(`✅ 成功: ${successCount}, ❌ 失敗: ${failCount}`);

  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    // 不關閉瀏覽器，保持連接
  }
}

main();
