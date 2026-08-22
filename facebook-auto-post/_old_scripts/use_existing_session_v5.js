/**
 * Facebook 自動發文 v5 - 正式版
 * 3 個文字模板 + 動態日期 + AntiBot + 自動記錄
 * 2026-08-09 確認
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
    // Step 1: 導航到群組
    await page.goto(`https://www.facebook.com/groups/${groupId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Step 2: 滾到頂部，確保「寫點內容」可見
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Step 3: 點擊「寫點內容」打開模態框
    console.log('[Step 3] 點擊「寫點內容」...');
    let composerClicked = false;
    const composerTexts = ['寫點內容', '寫點內容......', '写点什么', 'Write something'];

    for (const searchText of composerTexts) {
      if (composerClicked) break;
      try {
        const el = page.locator('span', { hasText: searchText }).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click({ timeout: 5000 });
          composerClicked = true;
          console.log(`[Step 3] ✅ 已點擊「${searchText}」`);
        }
      } catch (e) { /* next */ }

      if (!composerClicked) {
        composerClicked = await page.evaluate((text) => {
          const spans = document.querySelectorAll('span');
          for (const s of spans) {
            if (s.textContent.includes(text) && s.offsetParent !== null) {
              s.click();
              return true;
            }
          }
          return false;
        }, searchText);
        if (composerClicked) console.log(`[Step 3] ✅ JS click「${searchText}」`);
      }
    }

    if (!composerClicked) {
      console.log('❌ 找不到發文框');
      await page.screenshot({ path: `/tmp/fb_no_composer_${Date.now()}.png` });
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到發文框' };
    }

    // Step 4: 等待「建立帖子」模態框出現（直接等，不滾動頁面）
    console.log('[Step 4] 等待模態框...');
    await page.waitForTimeout(3000);

    // Step 5: 找模態框內輸入框
    console.log('[Step 5] 找模態框內輸入框...');
    let inputEl = null;

    // 方法1: 找 role="dialog" 內
    inputEl = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"], [aria-label="建立帖子"], [aria-label="建立公開帖子"], [aria-label="Create a public post"]');
      if (dialog) {
        const editable = dialog.querySelector('div[contenteditable="true"][data-lexical-editor="true"]')
                      || dialog.querySelector('div[contenteditable="true"][role="textbox"]')
                      || dialog.querySelector('div[contenteditable="true"]');
        if (editable) { editable.focus(); editable.click(); return 'found_in_dialog'; }
      }
      return null;
    });

    if (inputEl) {
      console.log('[Step 5] ✅ 在模態框內找到輸入框');
    } else {
      // 方法2: 找所有 contenteditable，選最寬的（排除明顯太窄的）
      const inputSelectors = [
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
      ];
      let bestEl = null;
      let bestWidth = 0;

      for (const selector of inputSelectors) {
        const els = await page.$$(selector);
        for (const el of els) {
          try {
            if (await el.isVisible()) {
              const rect = await el.boundingBox();
              if (rect && rect.width > bestWidth) {
                bestEl = el;
                bestWidth = rect.width;
              }
            }
          } catch (e) { continue; }
        }
      }

      if (bestEl && bestWidth > 200) {
        inputEl = bestEl;
        await inputEl.evaluate(el => { el.focus(); el.click(); });
        console.log(`[Step 5] ✅ 備用方案找到輸入框 (寬度: ${Math.round(bestWidth)})`);
      }
    }

    if (!inputEl) {
      console.log('❌ 找不到模態框內輸入框');
      await page.screenshot({ path: `/tmp/fb_no_input_${Date.now()}.png` });
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到輸入框' };
    }

    await AntiBot.pause(500, 1000);

    // Step 6: 先上傳圖片（圖片上傳後會清空文字，所以必須先傳圖）
    console.log('[Step 6] 先上傳圖片...');
    const fileInputs = await page.$$('input[type="file"]');
    if (fileInputs.length > 0) {
      const imagePath = getRandomImage();
      await fileInputs[fileInputs.length - 1].setInputFiles(imagePath);
      console.log(`[Step 6] ✅ 已選擇圖片: ${imagePath}`);
      await AntiBot.pause(4000, 6000); // 等待圖片上傳完成
    } else {
      console.log('[Step 6] ⚠️ 找不到 file input，跳過圖片');
    }

    // Step 7: 圖片上傳完成後，再輸入文字（在圖片上方）
    console.log('[Step 7] 圖片上傳完成，現在輸入文字...');
    // 重新找到輸入框（圖片上傳後 DOM 可能變化）
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"], [aria-label="建立帖子"], [aria-label="建立公開帖子"]');
      if (dialog) {
        const editable = dialog.querySelector('div[contenteditable="true"]');
        if (editable) { editable.focus(); editable.click(); }
      } else {
        // 備用：找最寬的 contenteditable
        const all = document.querySelectorAll('div[contenteditable="true"]');
        let best = null, bestW = 0;
        for (const el of all) {
          if (el.offsetParent !== null) {
            const r = el.getBoundingClientRect();
            if (r.width > bestW) { best = el; bestW = r.width; }
          }
        }
        if (best) { best.focus(); best.click(); }
      }
    });
    await AntiBot.pause(500, 1000);

    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    await page.keyboard.type(content, { delay: 30 });
    console.log(`[Step 7] ✅ 已輸入 ${content.length} 字`);
    await AntiBot.pause(1000, 2000);

    // Step 8: 等待預覽載入
    console.log('[Step 8] 等待預覽載入...');
    await page.waitForTimeout(2000);

    // Step 9: 點擊「發佈」
    console.log('[Step 9] 點擊「發佈」...');
    let published = await page.evaluate(() => {
      const allBtns = document.querySelectorAll('div[role="button"], button');
      // 找所有「發佈」按鈕，選 y 坐標最小的（模態框內最上方那個才是真正的發佈）
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
      // 備用: Playwright force click
      try {
        const btn = page.locator('div[role="button"]', { hasText: '發佈' }).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click({ force: true });
          published = true;
          console.log('[Step 9] ✅ Playwright force click 發佈');
        }
      } catch (e) { /* next */ }
    }

    if (!published) {
      console.log('[Step 9] 嘗試 Ctrl+Enter...');
      await page.keyboard.press('Control+Enter');
    }

    // Step 10: 檢測結果（點擊發佈後 5 秒內模態框關閉 = 成功）
    await AntiBot.pause(4000, 6000);
    const modalGone = await page.evaluate(() => {
      // 方法1: 檢查 contenteditable 輸入框數量（模態框內有，背景頁面沒有）
      const editables = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]');
      let visibleCount = 0;
      for (const el of editables) {
        if (el.offsetParent !== null) visibleCount++;
      }
      // 模態框關閉後，可見的 lexical editor 應該為 0 或只有背景頁面的
      // 方法2: 檢查頁面是否有「寫點內容」（代表回到群組頁面）
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if (s.textContent.includes('寫點內容') && s.offsetParent !== null) {
          return true; // 回到群組頁面 = 模態框已關閉
        }
      }
      return visibleCount === 0;
    });

    if (published && modalGone) {
      console.log(`[Step 10] ✅ 模態框已關閉，發文成功`);
      console.log(`✅ 發文成功: ${groupName}`);
      return { status: 'success', group_id: groupId, group_name: groupName, content, timestamp: new Date().toISOString() };
    } else if (published) {
      console.log(`[Step 10] ⚠️ 模態框仍在，可能需審批`);
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
  console.log('========== 使用已登入 Session 發文 (v5) ==========');

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
    const targetGroups = CONFIG.groups.slice(0, 5);

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
