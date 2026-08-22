/**
 * Facebook 自動發文 v4 - 基於 v3 修復版
 * 在群組頂部「寫點內容」建立新帖（不是評論舊帖）
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

// === 日誌 ===
function loadPostLog() {
  try { return JSON.parse(fs.readFileSync(CONFIG.postLogFile, 'utf8')); }
  catch { return { posts: [], statistics: { success: 0, pending_review: 0, failed: 0 } }; }
}
function savePostLog(log) { fs.writeFileSync(CONFIG.postLogFile, JSON.stringify(log, null, 2)); }
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
  const recent = log.posts.filter(p =>
    p.group_id === groupId && p.status !== 'failed' &&
    (Date.now() - new Date(p.timestamp).getTime()) < 24 * 60 * 60 * 1000
  );
  return recent.length > 0;
}

// === 隨機圖片 ===
function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

// === AI 隨機文案 ===
function getAIText() {
  const now = new Date();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${days[now.getDay()]}`;
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。',
    '晚間駕駛請開啟車燈，確保安全。',
  ];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dateStr} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
}

// === 模板 ===
function getTemplate(num, aiText) {
  const t = {
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
#汽車保險 #保險報價 #續保 #港車北上 #modelS #Tesla #modelY #BYD`,
  };
  return t[num] || t[1];
}

// === 發文到單個群組（每次開新分頁）===
async function postToGroup(browser, group, templateNum) {
  const { id: groupId, name: groupName } = group;

  if (hasAlreadyPosted(groupId)) {
    console.log(`⏭️  跳過（24h內已發）: ${groupName || groupId}`);
    return { status: 'skipped', group_id: groupId };
  }

  console.log(`\n=== 發文: ${groupName || groupId} ===`);

  const context = browser.contexts()[0];
  const page = await context.newPage();

  try {
    // ---- STEP 1: 導航到群組 ----
    console.log('[1] 導航到群組...');
    await page.goto(`https://www.facebook.com/groups/${groupId}`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(3000);

    // ---- STEP 2: 滾到頂部 ----
    console.log('[2] 滾到頂部...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    // ---- STEP 3: 點擊「寫點內容」/「写点什么...」---- 
    console.log('[3] 點擊發文框...');
    let composerClicked = false;

    // 策略 A: 找到文字為「寫點內容」或「写点什么...」的 span/div，滾入視圖後點擊
    const composerTexts = ['寫點內容', '写点什么...', 'Write something'];
    for (const text of composerTexts) {
      if (composerClicked) break;
      try {
        const el = page.locator(`span:text-is("${text}")`).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          await el.click({ timeout: 5000 });
          composerClicked = true;
          console.log(`   ✅ 點擊了「${text}」`);
        }
      } catch (e) { /* next */ }
    }

    // 策略 B: JS evaluate click
    if (!composerClicked) {
      composerClicked = await page.evaluate(() => {
        const texts = ['寫點內容', '写点什么...', 'Write something'];
        for (const el of document.querySelectorAll('span, div')) {
          const t = el.textContent.trim();
          if (texts.some(txt => t.includes(txt)) && el.offsetParent !== null) {
            el.scrollIntoView({ block: 'center' });
            el.click();
            return true;
          }
        }
        return false;
      });
      if (composerClicked) console.log('   ✅ JS click 發文框');
    }

    if (!composerClicked) {
      console.log('   ❌ 找不到發文框');
      await page.screenshot({ path: `/tmp/fb_no_composer_${groupId}.png` });
      return { status: 'failed', group_id: groupId, note: '找不到發文框' };
    }

    await page.waitForTimeout(2000);

    // ---- STEP 4: 等待編輯器出現（dialog 內的 contenteditable）----
    console.log('[4] 等待編輯器...');
    await page.waitForTimeout(2000);

    let inputEl = null;

    // 優先找 dialog 內的 contenteditable（新帖 dialog）
    const dialogEditable = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        const editables = dialog.querySelectorAll('div[contenteditable="true"]');
        for (const el of editables) {
          if (el.offsetParent !== null && el.offsetHeight > 20) {
            return true;
          }
        }
      }
      return false;
    });

    if (dialogEditable) {
      // 找 dialog 內最後一個 visible contenteditable
      const allEditable = await page.$$('div[role="dialog"] div[contenteditable="true"]');
      for (const el of allEditable) {
        try {
          if (await el.isVisible()) {
            const box = await el.boundingBox();
            if (box && box.height > 20) {
              inputEl = el;
              console.log(`   ✅ 找到 dialog 內編輯器 at y=${Math.round(box.y)}`);
              break;
            }
          }
        } catch (e) { continue; }
      }
    }

    // 備用：找頁面上半部的 contenteditable（非 dialog）
    if (!inputEl) {
      const allEditable = await page.$$('div[contenteditable="true"]');
      for (const el of allEditable) {
        try {
          if (await el.isVisible()) {
            const box = await el.boundingBox();
            if (box && box.y < 600 && box.height > 20) {
              inputEl = el;
              console.log(`   ✅ 找到頁面編輯器 at y=${Math.round(box.y)}`);
              break;
            }
          }
        } catch (e) { continue; }
      }
    }

    if (!inputEl) {
      console.log('   ❌ 找不到編輯器');
      await page.screenshot({ path: `/tmp/fb_no_editor_${groupId}.png` });
      return { status: 'failed', group_id: groupId, note: '找不到編輯器' };
    }

    // ---- STEP 5: 輸入內容 ----
    console.log('[5] 輸入內容...');
    await inputEl.click();
    await page.waitForTimeout(500);

    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    await page.keyboard.type(content, { delay: 15 });
    console.log(`   ✅ 已輸入 ${content.length} 字`);

    // ---- STEP 6: 等待連結預覽載入 ----
    console.log('[6] 等待連結預覽...');
    for (let i = 0; i < 15; i++) {
      const loading = await page.evaluate(() =>
        document.body.innerText.includes('正在建立連結預覽') ||
        document.body.innerText.includes('正在创建链接预览')
      );
      if (!loading) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1000);

    // ---- STEP 7: 上傳圖片（dialog 內）----
    console.log('[7] 上傳圖片...');
    const imagePath = getRandomImage();

    // 先找 dialog 內的 file input
    let fileInput = await page.$('div[role="dialog"] input[type="file"]');
    if (!fileInput) {
      fileInput = await page.$('input[type="file"]');
    }

    if (fileInput) {
      await fileInput.setInputFiles(imagePath);
      console.log(`   ✅ 已上傳: ${imagePath.split('/').pop()}`);
      await page.waitForTimeout(5000); // 圖片上傳需要更多時間
    } else {
      console.log('   ⚠️ 找不到檔案上傳按鈕');
    }

    // ---- STEP 8: 點擊「發佈」按鈕（dialog 內）----
    console.log('[8] 點擊發佈...');
    let published = false;

    // 策略 A: dialog 內的按鈕
    const dialogBtnTexts = ['發佈', '发布', 'Post'];
    for (const text of dialogBtnTexts) {
      if (published) break;
      try {
        const btn = page.locator(`div[role="dialog"] div[role="button"]:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click();
          published = true;
          console.log(`   ✅ 點擊 dialog「${text}」`);
        }
      } catch (e) { /* next */ }
    }

    // 策略 B: dialog 內的 button 元素
    if (!published) {
      try {
        const btns = await page.$$('div[role="dialog"] button');
        for (const btn of btns) {
          try {
            const text = (await btn.textContent()).trim();
            if (['發佈', '发布', 'Post', '分享'].includes(text) && await btn.isVisible()) {
              await btn.click();
              published = true;
              console.log(`   ✅ 點擊 dialog button「${text}」`);
              break;
            }
          } catch (e) { continue; }
        }
      } catch (e) {}
    }

    // 策略 C: Ctrl+Enter
    if (!published) {
      console.log('   ⚠️ 找不到發佈按鈕，嘗試 Ctrl+Enter');
      await page.keyboard.press('Control+Enter');
      published = true;
    }

    // ---- STEP 9: 等待結果 ----
    console.log('[9] 等待結果...');
    await page.waitForTimeout(5000);

    // 截圖記錄
    await page.screenshot({ path: `/tmp/fb_result_${groupId}_${Date.now()}.png` });

    // 簡單判斷：如果 dialog 關閉了 = 成功
    const dialogGone = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      return !dialog || dialog.offsetParent === null;
    });

    const status = dialogGone ? 'success' : 'unknown';
    console.log(`   ${status === 'success' ? '✅' : '❓'} 狀態: ${status}`);

    return { status, group_id: groupId, group_name: groupName, timestamp: new Date().toISOString() };

  } catch (err) {
    console.log(`   ❌ 錯誤: ${err.message}`);
    try { await page.screenshot({ path: `/tmp/fb_error_${groupId}_${Date.now()}.png` }); } catch (e) {}
    return { status: 'failed', group_id: groupId, note: err.message };
  } finally {
    await page.close().catch(() => {});
  }
}

// === 主流程 ===
async function main() {
  console.log('========== Facebook 自動發文 v4 ==========\n');

  const browser = await chromium.connectOverCDP('http://localhost:9222');

  // 檢查登入
  const checkPage = await browser.contexts()[0].newPage();
  await checkPage.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await checkPage.waitForTimeout(2000);
  if (checkPage.url().includes('login')) {
    console.log('❌ 未登入！');
    await checkPage.close();
    return;
  }
  await checkPage.close();
  console.log('✅ 已登入\n');

  // 取前 5 個群組發文
  const groups = CONFIG.groups.slice(0, 5);
  const templateNum = 1;

  for (let i = 0; i < groups.length; i++) {
    const result = await postToGroup(browser, groups[i], templateNum);
    addPostRecord(result);

    if (i < groups.length - 1) {
      const wait = 15000 + Math.random() * 15000;
      console.log(`\n等待 ${(wait / 1000).toFixed(0)} 秒...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  console.log('\n========== 完成 ==========');
}

main().catch(e => console.error('致命錯誤:', e.message));
