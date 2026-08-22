/**
 * 批量發文腳本 - 使用 V5 最終版
 * 每 55 個群組關閉 50 個頁面防止 Chrome 卡死
 * 參數: node batch_post_59118437.js [startIndex] [totalCount]
 */

const { chromium } = require('playwright');
const fs = require('fs');

const UNPOSTED_FILE = './fb_unposted_59118437.json';
const IMAGES_DIR = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg';
const POST_LOG_FILE = './fb_post_log.json';
const BATCH_SIZE = 55;
const CLOSE_COUNT = 50;

const startIndex = parseInt(process.argv[2]) || 0;
const totalCount = parseInt(process.argv[3]) || 292;

// Load unposted groups
function loadUnpostedGroups() {
  const data = JSON.parse(fs.readFileSync(UNPOSTED_FILE, 'utf8'));
  return data.groups;
}

// Post log functions
function loadPostLog() {
  try {
    return JSON.parse(fs.readFileSync(POST_LOG_FILE, 'utf8'));
  } catch {
    return { posts: [], statistics: { success: 0, pending_review: 0, requires_question: 0, failed: 0 }, total_posts: 0, last_updated: null };
  }
}

function savePostLog(log) {
  fs.writeFileSync(POST_LOG_FILE, JSON.stringify(log, null, 2));
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

// Random helpers
function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${IMAGES_DIR}/${images[Math.floor(Math.random() * images.length)]}`;
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

// Pause helper
function pause(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

// Close background pages (keep first 2)
async function closeBackgroundPages(browser, keepCount = 2) {
  const contexts = browser.contexts();
  let closed = 0;
  for (const ctx of contexts) {
    const pages = ctx.pages();
    for (let i = keepCount; i < pages.length; i++) {
      try {
        await pages[i].close();
        closed++;
      } catch (e) {}
    }
  }
  return closed;
}

// Post to a single group
async function postToGroup(page, group, templateNum) {
  const groupId = group.id;
  const groupName = group.name;

  try {
    if (hasAlreadyPosted(groupId)) {
      console.log(`[跳過] ${groupName} - 24小時內已發過`);
      return { status: 'skipped', group_id: groupId, group_name: groupName };
    }

    // Step 1: Navigate
    console.log(`[1/9] 導航: ${groupName}`);
    await page.goto(`https://www.facebook.com/groups/${groupId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pause(3000, 5000);

    // Step 2: Click "Write something"
    console.log(`[2/9] 點擊「寫點內容」...`);
    const clicked = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if ((s.textContent.includes('寫點內容') || s.textContent.includes('Write something')) && s.offsetParent !== null) {
          s.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      console.log(`❌ 找不到「寫點內容」按鈕`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到寫點內容按鈕' };
    }

    // Step 3: Wait for modal
    console.log(`[3/9] 等待模態框...`);
    await pause(2000, 3000);

    // Step 4: Find input area
    console.log(`[4/9] 找輸入框...`);
    const inputFound = await page.evaluate(() => {
      const editors = document.querySelectorAll('[contenteditable="true"][role="textbox"]');
      for (const e of editors) {
        if (e.offsetParent !== null) {
          e.focus();
          return true;
        }
      }
      return false;
    });

    if (!inputFound) {
      console.log(`❌ 找不到輸入框`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到輸入框' };
    }

    // Step 5: Upload image
    console.log(`[5/9] 上傳圖片...`);
    const imagePath = getRandomImage();
    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        page.evaluate(() => {
          const btns = document.querySelectorAll('[aria-label*="相片"], [aria-label*="photo"], [aria-label*="Photo"], [aria-label*="媒體"], [aria-label*="media"]');
          for (const b of btns) {
            if (b.offsetParent !== null) { b.click(); return true; }
          }
          return false;
        })
      ]);
      await fileChooser.setFiles(imagePath);
      console.log(`  ✅ 圖片已上傳: ${imagePath}`);
      await pause(3000, 5000);
    } catch (e) {
      console.log(`  ⚠️ 圖片上傳失敗，嘗試備用方式...`);
      try {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(imagePath);
          console.log(`  ✅ 圖片已上傳 (備用方式)`);
          await pause(3000, 5000);
        }
      } catch (e2) {
        console.log(`  ❌ 圖片上傳失敗: ${e2.message}`);
      }
    }

    // Step 6: Paste text
    console.log(`[6/9] 貼文字...`);
    const template = getTemplate(templateNum, getAIText());
    await page.evaluate((text) => {
      const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
      if (editor) {
        editor.focus();
        document.execCommand('insertText', false, text);
      }
    }, template);
    await pause(1000, 2000);

    // Step 7: Wait for preview
    console.log(`[7/9] 等待預覽...`);
    await pause(2000, 3000);

    // Step 8: Click publish
    console.log(`[8/9] 點擊發佈...`);
    const published = await page.evaluate(() => {
      const btns = document.querySelectorAll('[aria-label*="發佈"], [aria-label*="Post"], [aria-label*="发布"]');
      for (const b of btns) {
        if (b.offsetParent !== null && !b.disabled) {
          b.click();
          return true;
        }
      }
      return false;
    });

    if (!published) {
      console.log(`❌ 找不到發佈按鈕`);
      return { status: 'failed', group_id: groupId, group_name: groupName, error: '找不到發佈按鈕' };
    }

    // Step 9: Wait and close
    console.log(`[9/9] 等待發佈完成...`);
    await pause(3000, 5000);

    console.log(`✅ 發文成功: ${groupName}`);
    return { status: 'success', group_id: groupId, group_name: groupName };

  } catch (err) {
    console.log(`❌ 發文失敗: ${groupName} - ${err.message}`);
    return { status: 'failed', group_id: groupId, group_name: groupName, error: err.message };
  }
}

// Main batch runner
async function main() {
  const allGroups = loadUnpostedGroups();
  const groups = allGroups.slice(startIndex, startIndex + totalCount);
  console.log(`\n========================================`);
  console.log(`批量發文開始`);
  console.log(`總群組: ${groups.length} (從 ${startIndex} 開始)`);
  console.log(`每 ${BATCH_SIZE} 個關閉 ${CLOSE_COUNT} 個頁面`);
  console.log(`========================================\n`);

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log('✅ 已連接 Chrome\n');

  let success = 0, failed = 0, skipped = 0;
  let templateNum = 1;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const globalIndex = startIndex + i;

    // Every BATCH_SIZE groups, close CLOSE_COUNT pages
    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(`\n🔄 已完成 ${i} 個，關閉 ${CLOSE_COUNT} 個頁面防止卡死...`);
      const closed = await closeBackgroundPages(browser, 2);
      console.log(`  已關閉 ${closed} 個頁面\n`);
      await pause(2000, 3000);
    }

    console.log(`\n[${i + 1}/${groups.length}] 發文到: ${group.name} (${group.id})`);

    // Get or create page
    let page;
    const contexts = browser.contexts();
    if (contexts.length > 0 && contexts[0].pages().length > 0) {
      page = contexts[0].pages()[0];
    } else {
      page = await browser.newPage();
    }

    const result = await postToGroup(page, group, templateNum);
    templateNum = templateNum >= 3 ? 1 : templateNum + 1;

    if (result.status === 'success') success++;
    else if (result.status === 'failed') failed++;
    else skipped++;

    // Save result
    if (result.status !== 'skipped') {
      addPostRecord({
        ...result,
        account: '+852****8437',
        template: templateNum,
        timestamp: new Date().toISOString()
      });
    }

    // Progress update every 10 groups
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 進度: ${i + 1}/${groups.length} | ✅${success} ❌${failed} ⏭️${skipped}`);
    }

    // Random delay between groups
    await pause(2000, 4000);
  }

  console.log(`\n========================================`);
  console.log(`批量發文完成！`);
  console.log(`✅ 成功: ${success}`);
  console.log(`❌ 失敗: ${failed}`);
  console.log(`⏭️ 跳過: ${skipped}`);
  console.log(`========================================`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
