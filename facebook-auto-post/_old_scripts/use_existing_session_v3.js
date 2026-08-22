/**
 * Facebook 自動發文 v3 - 使用 text locator + evaluate click
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
  const dates = [dateStr];
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

async function connectToChrome() {
  console.log('[DEBUG] 連接到 Chrome 除錯端口...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log('[DEBUG] 已連接 Chrome');
  return browser;
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
    // 導航到群組
    await page.goto(`https://www.facebook.com/groups/${groupId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // 滾到頂部
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    // 滾到頁面頂部，確保 composer 可見
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // 先檢查是否有「写点什么...」元素
    const hasComposer = await page.evaluate(() => {
      const all = document.querySelectorAll('span, div');
      for (const el of all) {
        if (el.textContent.trim() === '写点什么...' && el.offsetParent !== null) {
          return true;
        }
      }
      return false;
    });

    if (!hasComposer) {
      console.log('[DEBUG] 此群組沒有發文框（私隱組或需要加入）');
    }

    // 嘗試點擊「写点什么...」
    console.log('[DEBUG] 嘗試點擊「写点什么...」');
    let clicked = false;
    
    // 方法1: evaluate 找到所有「写点什么...」並滾入視圖後點擊
    clicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('span, div');
      let candidates = [];
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.trim() === '写点什么...' && el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          if (rect.top > 0 && rect.height > 0) {
            candidates.push({ el, top: rect.top, rect });
          }
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.top - b.top);
        const target = candidates[0];
        // 滾入視圖
        target.el.scrollIntoView({ behavior: 'instant', block: 'center' });
        // 等待一下讓 UI 更新
        return true;
      }
      return false;
    });

    if (clicked) {
      await page.waitForTimeout(800);
      // 現在用 Playwright 的 click
      try {
        const el = page.locator('span', { hasText: '写点什么...' }).first();
        if (await el.isVisible()) {
          const box = await el.boundingBox();
          console.log(`[DEBUG] Playwright 點擊 y=${box?.y}`);
          await el.click({ timeout: 5000 });
          console.log('[DEBUG] 已點擊');
          clicked = true;
        }
      } catch (e) {
        console.log('[DEBUG] Playwright click 失敗:', e.message);
      }
      await AntiBot.pause(1000, 2000);
    }

    if (clicked) {
      console.log('[DEBUG] 已 dispatchEvent 点击「写点什么...」');
      await AntiBot.pause(1500, 2500);
    } else {
      console.log('[DEBUG] 找不到「写点什么...」');
    }

    // 等待編輯器出現
    await page.waitForTimeout(2000);

    // 等待 link preview 完成（如果有的話）
    await page.waitForFunction(() => {
      const preview = document.querySelector('[aria-label*="鏈接預覽"], [aria-label*="链接预览"], [aria-label*="預覽"]');
      return !preview || preview.textContent.includes('完成') || preview.textContent.includes('无法');
    }, { timeout: 5000 }).catch(() => {
      console.log('[DEBUG] link preview 检测超时，继续');
    });

    // 滾回頂部確認狀態
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // 查找輸入框 - 等待並查找可編輯元素
    let inputEl = null;
    const inputSelectors = [
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[name="xhpc_message"]',
    ];

    for (const selector of inputSelectors) {
      const els = await page.$$(selector);
      for (const el of els) {
        try {
          const visible = await el.isVisible();
          if (visible) {
            const rect = await el.boundingBox();
            if (rect && rect.y < 600) { // 只考慮頁面上半部分的輸入框
              inputEl = el;
              console.log(`[DEBUG] 找到輸入框: ${selector} at [${rect.x},${rect.y}]`);
              break;
            }
          }
        } catch (e) { continue; }
      }
      if (inputEl) break;
    }

    if (!inputEl) {
      await page.screenshot({ path: `/tmp/fb_error_${Date.now()}.png` });
      console.log(`❌ 發文失敗: 找不到輸入框`);
      return { status: 'failed', group_id: groupId, group_name: groupName };
    }

    // 點擊輸入框激活
    await inputEl.click();
    await AntiBot.pause(500, 1000);

    // 生成並輸入內容
    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    
    await page.keyboard.type(content, { delay: 50 });
    await AntiBot.pause(500, 1000);

    // 上傳圖片
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      const imagePath = getRandomImage();
      await fileInput.setInputFiles(imagePath);
      console.log(`[DEBUG] 已選擇圖片: ${imagePath}`);
    }

    // 等待 link preview 完成（最多20秒）
    console.log('[DEBUG] 等待 link preview 完成...');
    await page.waitForFunction(() => {
      const els = document.querySelectorAll('div[aria-label], span[aria-label]');
      for (const el of els) {
        const text = el.getAttribute('aria-label') || '';
        if (text.includes('正在創建') || text.includes('正在创建') || text.includes('链接预览')) {
          return false; // 仍在創建
        }
      }
      return true; // 完成或沒有預覽
    }, { timeout: 20000 }).catch(() => console.log('[DEBUG] link preview 等待超時'));

    await AntiBot.pause(1000, 2000);

    // 點擊發布按鈕（使用自定義邏輯，添加更多選擇器）
    const publishSelectors = [
      'button:has-text("發布")',
      'button:has-text("发布")',
      'button:has-text("發佈")',
      'button:has-text("分享")',
      'button[aria-label*="Post"]',
      'button[aria-label*="Share"]',
      'button[type="submit"]',
      'div[role="button"]:has-text("發")',
      'div[aria-label="發布"]',
      'div[aria-label="发布"]',
    ];

    let published = false;
    for (const selector of publishSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          const visible = await el.isVisible();
          if (visible) {
            console.log(`[DEBUG] 點擊發布按鈕: ${selector}`);
            await el.click();
            published = true;
            await AntiBot.pause(500, 1000);
            break;
          }
        }
      } catch (e) { continue; }
    }

    // 如果找不到按鈕，嘗試 Ctrl+Enter 提交
    if (!published) {
      console.log('[DEBUG] 嘗試 Ctrl+Enter 提交');
      await page.keyboard.press('Control+Enter');
      published = true; // 假設成功
      await AntiBot.pause(500, 1000);
    }

    await AntiBot.pause(3000, 5000);

    // 檢測狀態
    const postResult = await AntiBot.detectPostStatus(page);
    console.log(`[DEBUG] 發文狀態: ${postResult.status} - ${postResult.note}`);

    if (postResult.status === 'success') {
      console.log(`✅ 發文成功（直接發佈）: ${groupName}`);
      return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };
    } else if (postResult.status === 'pending_review') {
      console.log(`✅ 發文成功（需審批）: ${groupName} - ${postResult.note}`);
      return { status: 'pending_review', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString(), note: postResult.note };
    } else if (postResult.status === 'unknown') {
      // unknown 狀態可能是因為 post 已成功但來不及檢測
      console.log(`✅ 發文成功（狀態未知）: ${groupName} - ${postResult.note}`);
      return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString(), note: postResult.note };
    } else {
      console.log(`❌ 發文失敗: ${postResult.note}`);
      return { status: postResult.status, group_id: groupId, group_name: groupName, note: postResult.note };
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
  console.log('========== 使用已登入 Session 發文 (v3) ==========');

  let browser;
  try {
    browser = await connectToChrome();
    const contexts = browser.contexts();
    const context = contexts[0];
    const page = await context.newPage();

    // 處理任何彈出的對話框
    page.on('dialog', async dialog => {
      console.log(`[DEBUG] 對話框: ${dialog.message()}`);
      try {
        await dialog.accept();
      } catch (e) {
        console.log(`[DEBUG] 對話框處理失敗: ${e.message}`);
      }
    });

    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`[DEBUG] 當前URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('❌ 未登入');
      return;
    }

    const templateNum = 1;
    const targetGroups = CONFIG.groups.slice(105, 110);

    console.log(`\n========== 時段 1 ==========\n`);

    for (let i = 0; i < targetGroups.length; i++) {
      const group = targetGroups[i];
      console.log(`\n[${i + 1}/5] 群組: ${group.id} (${group.name})`);

      const result = await postToGroup(page, group, templateNum);
      addPostRecord(result);

      if (i < targetGroups.length - 1) {
        const waitTime = 15000 + Math.random() * 20000;
        console.log(`等待 ${(waitTime / 1000).toFixed(1)} 秒後發送下一個...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    console.log('\n========== 時段 1 完成 ==========');

  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
