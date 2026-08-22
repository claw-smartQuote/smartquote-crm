/**
 * Facebook 自動發文 - 每帖獨立分頁流程
 * 
 * 流程：
 * 1. 連接已登入的 Chrome (保持舊 session)
 * 2. 共用一個 CDP context 開新分頁
 * 3. 每篇post：新分頁 → 確認登入 → 進群組 → 發文 → 關閉分頁
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

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
  const now = Date.now();
  return log.posts.some(p => 
    p.group_id === groupId && 
    (now - new Date(p.timestamp).getTime()) < 24 * 60 * 60 * 1000
  );
}

function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

function getAIText() {
  const dates = ['📅 2026年4月27日 星期一'];
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。',
    '晚間駕駛請開啟車燈，確保安全。',
  ];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dates[0]} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
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

// 每篇post處理的async function
async function postToGroup(sharedContext, group, templateNum) {
  const groupId = group.id;
  const groupName = group.name;

  if (hasAlreadyPosted(groupId)) {
    console.log(`⏭️  24小時內已發過，跳過: ${groupName}`);
    return { status: 'skipped', group_id: groupId, group_name: groupName };
  }

  let page = null;
  console.log(`=== 準備發文到: ${groupName} ===`);

  try {
    // 在 shared context 創建新分頁
    page = await sharedContext.newPage();

    // 1. 確認登入
    await page.goto('https://www.facebook.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(1500);

    if (page.url().includes('login')) {
      console.log(`❌ 未登入`);
      await page.close();
      return { status: 'failed', group_id: groupId, group_name: groupName, note: '未登入' };
    }

    // 2. 進入群組
    await page.goto(`https://www.facebook.com/groups/${groupId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);
    console.log(`[DEBUG] 已進入群組`);

    // 3. 滾到頂
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // 4. 點擊「写点什么...」
    console.log(`[DEBUG] 點擊發文框...`);
    
    // 嘗試 locator 點擊
    let clicked = false;
    try {
      const loc = page.locator('span', { hasText: '写点什么...' }).first();
      if (await loc.isVisible({ timeout: 5000 })) {
        await loc.click();
        clicked = true;
        console.log(`[DEBUG] locator 點擊成功`);
      }
    } catch (e) {
      console.log(`[DEBUG] locator 失敗: ${e.message.substring(0, 50)}`);
    }
    
    if (!clicked) {
      // fallback: evaluate click - 找可見的「写点什么...」元素
      const clickedResult = await page.evaluate(() => {
        const allEls = document.querySelectorAll('span, div');
        for (const el of allEls) {
          if (el.textContent.trim() === '写点什么...' && el.offsetParent !== null) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (clickedResult) {
        clicked = true;
        console.log(`[DEBUG] evaluate 點擊成功`);
      }
    }
    
    await AntiBot.pause(1500, 2500);

    // 5. 找輸入框（composer輸入框，唔係評論框）
    await page.waitForTimeout(2000);
    
    // 等待 composer 出現 - 搵有 data-lexical-editor 的 div（但唔係評論框）
    let inputEl = null;
    try {
      // 首先嘗試 locator 方式（搵頁面上半部分的 composer）
      const composers = await page.locator('div[contenteditable="true"][data-lexical-editor="true"]').all();
      for (const comp of composers) {
        try {
          const visible = await comp.isVisible();
          if (!visible) continue;
          const ariaLabel = await comp.getAttribute('aria-label');
          // 評論框有「输入回答...」，composer 通常冇或係「输入...」
          if (ariaLabel && ariaLabel.includes('回答')) continue;
          const rect = await comp.boundingBox();
          if (rect && rect.y < 600) {  // 只考慮頁面上半部分
            inputEl = comp;
            console.log(`[DEBUG] 找到 composer: aria-label=${ariaLabel} at [${Math.round(rect.x)},${Math.round(rect.y)}]`);
            break;
          }
        } catch (e) { continue; }
      }
    } catch (e) {}
    
    if (!inputEl) {
      console.log(`❌ 找不到 composer 輸入框`);
      await page.screenshot({ path: `/tmp/fb_err_${Date.now()}.png` });
      await page.close();
      return { status: 'failed', group_id: groupId, group_name: groupName, note: '找不到 composer 輸入框' };
    }

    await inputEl.click();
    await AntiBot.pause(500, 1000);

    // 6. 輸入文字
    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    await page.keyboard.type(content, { delay: 50 });
    console.log(`[DEBUG] 已輸入文字`);
    await AntiBot.pause(500, 1000);

    // 7. 上傳圖片
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      const imagePath = getRandomImage();
      await fileInput.setInputFiles(imagePath);
      console.log(`[DEBUG] 已選擇圖片`);
    }

    // 8. 等 link preview
    console.log(`[DEBUG] 等待 link preview...`);
    await page.waitForFunction(() => {
      const els = document.querySelectorAll('[aria-label]');
      for (const el of els) {
        const t = el.getAttribute('aria-label') || '';
        if (t.includes('正在創建') || t.includes('正在创建') || t.includes('链接预览')) return false;
      }
      return true;
    }, { timeout: 20000 }).catch(() => console.log(`[DEBUG] link preview 超時`));
    await AntiBot.pause(1000, 2000);

    // 9. 點擊發布
    console.log(`[DEBUG] 點擊發布...`);
    const publishOptions = [
      page.locator('div[aria-label="发布"]'),
      page.locator('div[aria-label="發布"]'),
      page.locator('button:has-text("發布")'),
      page.locator('button:has-text("发布")'),
      page.locator('button[aria-label*="Post"]'),
    ];

    for (const loc of publishOptions) {
      try {
        if (await loc.isVisible({ timeout: 2000 })) {
          await loc.click();
          break;
        }
      } catch (e) { continue; }
    }
    await AntiBot.pause(500, 1000);

    // 10. 等結果
    await AntiBot.pause(3000, 5000);

    // 11. 檢測狀態
    const result = await AntiBot.detectPostStatus(page);
    console.log(`[DEBUG] 狀態: ${result.status} - ${result.note}`);

    // 12. 關閉分頁（重要：只關 page，唔關 context）
    await page.close();
    console.log(`[DEBUG] 分頁已關閉`);

    if (result.status === 'success') {
      return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };
    } else if (result.status === 'pending_review') {
      return { status: 'pending_review', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString(), note: result.note };
    } else {
      return { status: result.status, group_id: groupId, group_name: groupName, note: result.note };
    }

  } catch (err) {
    console.log(`❌ 錯誤: ${err.message}`);
    try { await page?.screenshot({ path: `/tmp/fb_err_${Date.now()}.png` }); } catch (e) {}
    try { await page?.close(); } catch (e) {}
    return { status: 'failed', group_id: groupId, group_name: groupName, error: err.message };
  }
}

// 主流程
async function main() {
  console.log('========== FB 自動發文 (分頁版) ==========');

  let browser;
  let sharedContext = null;

  try {
    // 連接 Chrome
    console.log('[DEBUG] 連接 Chrome...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    
    // 確認已登入（用測試 page）
    const testCtx = await browser.newContext();
    const testPage = await testCtx.newPage();
    await testPage.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await testPage.waitForTimeout(2000);
    if (testPage.url().includes('login')) {
      console.log('❌ Chrome 未登入');
      await testPage.close();
      await testCtx.close();
      return;
    }
    console.log('[DEBUG] Chrome 已登入確認');
    await testPage.close();
    await testCtx.close();

    // 取得 shared context（CDP 只有一個 context）
    const contexts = browser.contexts();
    sharedContext = contexts[0];
    console.log(`[DEBUG] Shared context 已取得，共用於所有分頁`);

    // 選擇群組
    const templateNum = 2;
    const startIdx = 100;  // 從第100個群組開始（新群組）
    const targetGroups = CONFIG.groups.slice(startIdx, startIdx + 3);  // 只行3個避免被 kill
    console.log(`\n========== 準備發文到 ${targetGroups.length} 個群組 ==========\n`);

    for (let i = 0; i < targetGroups.length; i++) {
      const group = targetGroups[i];
      console.log(`\n[${i + 1}/${targetGroups.length}] ${group.name}`);

      const result = await postToGroup(sharedContext, group, templateNum);
      addPostRecord(result);

      if (i < targetGroups.length - 1) {
        const wait = 20000 + Math.random() * 15000;
        console.log(`等待 ${(wait / 1000).toFixed(1)} 秒...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }

    console.log('\n========== 全部完成 ==========');

  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
      console.log('[DEBUG] Chrome 保持不變');
    }
  }
}

main();
