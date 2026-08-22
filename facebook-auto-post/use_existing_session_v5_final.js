/**
 * Facebook 自動發文 v5 - 最終版
 * 流程：導航→點「寫點內容」→等模態框→找輸入框→附加圖片→貼文字→發佈→關閉
 * 使用 Playwright locator 方法（不觸發原生檔案對話框）
 * 參數: node use_existing_session_v5_final.js [startIndex] [count]
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

const startIndex = parseInt(process.argv[2]) || 0;
const postCount = parseInt(process.argv[3]) || 5;

function loadPostLog() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.postLogFile, 'utf8'));
  } catch {
    return { posts: [], statistics: { success: 0, failed: 0 } };
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
    return p.group_id === groupId && p.status === 'success' && (now - postTime) < 24 * 60 * 60 * 1000;
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
    1: `【${aiText}】\n🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上\n🔥 港車北上保險首選！¥1469 起！\n永誠保險 — 香港人正規註冊國內保險公司代理人\n✅ 交強險 + 商業第三者責任險 + 醫保外藥用險\n✅ 12次道路救援（拖車、送油、換胎）\n✅ 廣東話/國語雙語服務\n✅ 免費代辦ETC\n全港最平，歡迎 WhatsApp / Wechat 查詢👉🏻\nhttps://api.whatsapp.com/send?phone=85221101144\n📞 94924444\n#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
    2: `【${aiText}】\n🧐港車北上保險多少錢？\n市場行情參考：\n• 交強險 + 商業第三者責任險 + 醫保外用藥\n✅ 12次道路救援（拖車、送油、換胎）\n• 全套低至 ¥1469 起\n• 另有駕意險可加配\n與香港本地保險比較：\n✅ 性價比更高\n✅ 保障範圍更廣\n✅ 粵/國語雙語服務\n立馬 WhatsApp 比較報價！📱\nhttps://api.whatsapp.com/send?phone=85221101144\n📞 94924444\n#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
    3: `【${aiText}】\n🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上\n續保預登記享折扣\n• 交強險 + 商業第三者責任險 + 醫保外用藥\n✅ 12次道路救援（拖車、送油、換胎）\n• 全套低至 ¥1469 起\n• 另有駕意險可加配\nWhatsApp 24小時報價👇\nhttps://api.whatsapp.com/send?phone=85221101144\n📞 94924444\n#汽車保險 #保險報價 #續保 #港車北上 #modelS #Tesla #modelY #BYD`
  };
  return templates[num] || templates[1];
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 發文到單個群組
async function postToGroup(page, group, templateNum) {
  const groupId = group.id;
  const groupName = group.name;

  if (hasAlreadyPosted(groupId)) {
    console.log(`[跳過] ${groupName}`);
    return { status: 'skipped', group_id: groupId, group_name: groupName, timestamp: new Date().toISOString() };
  }

  try {
    // Step 1: 導航到群組
    console.log(`[1] 導航: ${groupName}`);
    await page.goto(`https://www.facebook.com/groups/${groupId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);

    // 關閉通知彈窗（如果出現）
    try {
      const notNowBtn = page.locator('[aria-label="現在不要"]').or(page.locator('button:has-text("Not Now")')).or(page.locator('button:has-text("暫時不要")')).first();
      if (await notNowBtn.count()) {
        await notNowBtn.click({ timeout: 2000 });
        console.log(`  ℹ️ 已關閉通知彈窗`);
        await wait(1000);
      }
    } catch (e) { /* 沒有彈窗，繼續 */ }

    // 檢查是否跳到登入頁
    if (page.url().includes('login')) {
      console.log(`❌ 未登入，跳過`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '未登入', timestamp: new Date().toISOString() };
    }

    // Step 2: 點擊「寫點內容」
    console.log(`[2] 打開建立帖子...`);
    const writeSpan = page.locator('span:has-text("寫點內容")').first();
    const writeExists = await writeSpan.count();
    if (!writeExists) {
      console.log(`❌ 找不到「寫點內容」`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到寫點內容按鈕', timestamp: new Date().toISOString() };
    }
    // 使用 force 點擊，繞過「已移除帖子」等覆蓋層
    await writeSpan.click({ force: true });
    await wait(3000);
    console.log(`  ✅ 已點擊寫點內容`);

    // Step 3: 等待帖子創建模態框出現（不是 Messenger）
    console.log(`[3] 等待模態框...`);
    await page.waitForFunction(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        // 跳過 Messenger dialog
        if (dialog.getAttribute('aria-label') === 'Messenger') continue;
        // 檢查是否包含 contenteditable 編輯器（帖子創建框的特徵）
        if (dialog.querySelector('[contenteditable="true"][data-lexical-editor="true"]')) {
          return true;
        }
      }
      return false;
    }, { timeout: 10000 });
    console.log(`  ✅ 帖子創建框已出現`);

    // Step 4: 附加圖片 (filechooser)
    console.log(`[4] 附加圖片...`);
    const image = getRandomImage();
    let uploaded = false;

    // 找到正確的帖子創建 dialog（不是 Messenger）
    const postDialog = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        // 跳過 Messenger dialog
        if (dialog.getAttribute('aria-label') === 'Messenger') continue;
        // 檢查是否包含 contenteditable 編輯器（帖子創建框的特徵）
        if (dialog.querySelector('[contenteditable="true"][data-lexical-editor="true"]')) {
          return true;
        }
      }
      return false;
    });

    if (!postDialog) {
      console.log(`  ❌ 找不到帖子創建框`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到帖子創建框', timestamp: new Date().toISOString() };
    }

    const photoBtn = page.locator('[role="dialog"]:not([aria-label="Messenger"]) [aria-label*="相片"], [role="dialog"]:not([aria-label="Messenger"]) [aria-label*="影片"], [role="dialog"]:not([aria-label="Messenger"]) [aria-label*="Photo"]').first();
    const photoExists = await photoBtn.count();

    if (photoExists) {
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          photoBtn.click()
        ]);
        await fileChooser.setFiles(image);
        uploaded = true;
        console.log(`  ✅ 圖片已附加`);
      } catch (e) {
        console.log(`  ❌ filechooser 失敗: ${e.message.substring(0, 80)}`);
      }
    }

    if (!uploaded) console.log(`  ⚠️ 圖片附加失敗`);
    await wait(5000);

    // Step 5: 輸入文字
    console.log(`[5] 貼文字...`);
    const content = getTemplate(templateNum, getAIText());
    const editor = page.locator('[role="dialog"]:not([aria-label="Messenger"]) [contenteditable="true"][data-lexical-editor="true"]').first();
    const editorExists = await editor.count();
    if (editorExists) {
      await editor.click();
      await wait(1000);
      await page.keyboard.type(content, { delay: 20 });
      await wait(2000);
      // 驗證文字是否輸入成功
      const textContent = await editor.textContent();
      if (textContent && textContent.length > 10) {
        console.log(`  ✅ 文字已輸入 (${textContent.length} 字)`);
      } else {
        console.log(`  ⚠️ 文字可能未輸入成功`);
      }
    } else {
      console.log(`  ❌ 找不到輸入框`);
    }

    // Step 6: 點擊發佈
    console.log(`[6] 點擊發佈...`);
    let published = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const postBtn = page.locator('[role="dialog"] [role="button"]:has-text("發佈")').first();
      const postExists = await postBtn.count();
      if (postExists) {
        const disabled = await postBtn.getAttribute('aria-disabled');
        if (disabled !== 'true') {
          await postBtn.click();
          published = true;
          console.log(`  ✅ 已點擊發佈`);
          break;
        }
      }
      await wait(1000);
    }

    if (!published) {
      console.log(`❌ 找不到發佈按鈕`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到發佈按鈕', timestamp: new Date().toISOString() };
    }

    // 等待發佈完成
    await wait(5000);

    console.log(`✅ 發文成功: ${groupName}`);
    return { status: 'success', group_id: groupId, group_name: groupName, content, image: image.split('/').pop(), timestamp: new Date().toISOString() };

  } catch (err) {
    console.log(`❌ 發文失敗: ${err.message}`);
    return { status: 'failed', group_id: groupId, group_name: groupName, error: err.message, timestamp: new Date().toISOString() };
  }
}

async function main() {
  console.log('========== Facebook 自動發文 v5 (最終版) ==========');
  console.log(`起始: ${startIndex}, 數量: ${postCount}`);

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  console.log('✅ 已連接 Chrome');

  // 找到已登入的頁面
  let page = null;
  for (const p of context.pages()) {
    if (p.url().includes('facebook.com') && !p.url().includes('login')) {
      page = p;
      break;
    }
  }

  if (!page) {
    console.log('❌ 找不到已登入的 Facebook 頁面');
    return;
  }
  console.log(`✅ 使用已登入頁面: ${page.url().substring(0, 60)}`);

  // 清理多餘頁面
  const pages = context.pages();
  for (const p of pages) {
    if (p !== page) {
      try { await p.close(); } catch (e) {}
    }
  }

  // 獲取目標群組
  const templateNum = Math.floor(Math.random() * 3) + 1;
  const targetGroups = CONFIG.groups.slice(startIndex, startIndex + postCount);

  console.log(`\n========== 開始發文 (${targetGroups.length} 個群組) ==========\n`);

  let success = 0, fail = 0, skip = 0;

  for (let i = 0; i < targetGroups.length; i++) {
    const group = targetGroups[i];
    console.log(`\n[${i + 1}/${targetGroups.length}] ${group.name} (${group.id})`);

    const result = await postToGroup(page, group, templateNum);
    addPostRecord(result);

    if (result.status === 'success' || result.status === 'pending_review') success++;
    else if (result.status === 'skipped') skip++;
    else fail++;

    // 隨機等待 3-8 秒
    if (i < targetGroups.length - 1 && result.status !== 'skipped') {
      const waitTime = 3000 + Math.random() * 5000;
      console.log(`等待 ${(waitTime / 1000).toFixed(1)} 秒...`);
      await wait(waitTime);
    }
  }

  console.log(`\n========== 完成 ==========`);
  console.log(`✅ 成功: ${success}, ❌ 失敗: ${fail}, ⏭ 跳過: ${skip}`);
}

main().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
