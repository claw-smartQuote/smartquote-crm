const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════
// Facebook 搜索加群 v3 — 10 關鍵詞 × 10 = 100 目標
// ═══════════════════════════════════════════════

const EMAIL = 'to@smartquote.cn';
const PASSWORD = '***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const KEYWORDS = [
  '港車北上',
  '兩地牌',
  '中港車',
  '粵港車',
  '跨境車',
  '大灣區車',
  '保姆車',
  '七人車',
  '珠海北上',
  '深圳北上'
];

const MAX_PER_KEYWORD = 10;
const TARGET_COUNT = 100;
const CDP_URL = 'http://127.0.0.1:9222';

// ── 隨機延遲 ──
function sleep(ms) {
  const jitter = ms * (0.5 + Math.random());
  return new Promise(r => setTimeout(r, jitter));
}

// ── 載入已加群組記錄 ──
const JOINED_LOG = path.join(WORK_DIR, 'fb_search_join_v3_log.json');
function loadJoinedLog() {
  try {
    return JSON.parse(fs.readFileSync(JOINED_LOG, 'utf-8'));
  } catch {
    return { total: 0, groups: [], keywords_done: [] };
  }
}
function saveJoinedLog(log) {
  fs.writeFileSync(JOINED_LOG, JSON.stringify(log, null, 2));
}

// ── 主流程 ──
async function main() {
  const log = loadJoinedLog();
  let total = log.total;
  const joined = log.groups;

  // ── 連接瀏覽器 ──
  let browser;
  console.log('🔗 嘗試連接 CDP:', CDP_URL);
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    console.log('✅ 已連接 Chrome CDP');
  } catch (e) {
    console.log('⚠️  CDP 連接失敗，啟動新瀏覽器...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });
  }

  const context = browser.contexts()[0] || await browser.newContext();
  // 永遠用新 tab，避免舊 page detached
  let page = await context.newPage();

  // ── 攔截 JS dialog（避免 No dialog is showing 錯誤）──
  page.on('dialog', d => d.dismiss().catch(() => {}));

  // ── 登入檢查 ──
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  const emailField = await page.$('input[name="email"]');
  if (emailField) {
    console.log('🔐 需要登入...');
    await emailField.fill(EMAIL);
    await sleep(500);
    const passField = await page.$('input[name="pass"]');
    if (passField) await passField.fill(PASSWORD);
    await sleep(500);
    const loginBtn = await page.$('button[name="login"], button[type="submit"]');
    if (loginBtn) await loginBtn.click();
    await sleep(6000);
    console.log('✅ 登入完成');
  } else {
    console.log('✅ 已登入');
  }

  // ── 逐關鍵詞搜索 ──
  for (const kw of KEYWORDS) {
    if (total >= TARGET_COUNT) {
      console.log(`\n🎯 已達目標 ${TARGET_COUNT}，停止`);
      break;
    }

    if (log.keywords_done.includes(kw)) {
      console.log(`⏭️  [${kw}] 已處理過，跳過`);
      continue;
    }

    console.log(`\n🔍 搜索: "${kw}"`);
    const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(kw)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);

    // 滾動加載更多結果（8 次）
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await sleep(1200);
    }
    // 滾回頂部再往下找
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);

    let joinedThisKw = 0;

    while (joinedThisKw < MAX_PER_KEYWORD && total < TARGET_COUNT) {
      const result = await page.evaluate(() => {
        // 找所有「加入」按鈕（多種匹配方式）
        const all = Array.from(document.querySelectorAll('div[role="button"], span, a'));
        for (const el of all) {
          const text = el.textContent.trim();
          const label = el.getAttribute('aria-label') || '';
          if (
            (text === '加入' || text === '加入群組' || label === '加入群組' || label === '加入') &&
            el.getBoundingClientRect().width > 0 &&
            el.getBoundingClientRect().height > 0
          ) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.click();
            return { clicked: true, text };
          }
        }
        return { clicked: false };
      });

      if (!result.clicked) {
        console.log(`  ⛔ [${kw}] 無更多「加入」按鈕`);
        break;
      }

      joinedThisKw++;
      total++;
      console.log(`  ✅ #${total} [${kw}] 加入成功 (${result.text})`);

      // 等待反應 + 隨機延遲
      await sleep(2500);

      // 檢查彈窗（有些群組需要回答問題）
      try {
        const closeBtn = await page.$('div[aria-label="關閉"], div[aria-label="Close"], [aria-label="關閉"]');
        if (closeBtn) {
          await closeBtn.click();
          console.log('  ⚠️  關閉彈窗（可能需要審批/回答問題）');
          await sleep(1000);
        }
      } catch {}

      // 攔截 JS dialog（避免 No dialog is showing 錯誤）
      // 已喺開頭註冊，呢度跳過

      // 繼續滾動
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1000);
    }

    console.log(`  📊 [${kw}] +${joinedThisKw}, 總計: ${total}`);

    // 記錄已完成關鍵詞
    log.keywords_done.push(kw);
    log.total = total;
    saveJoinedLog(log);

    // 關鍵詞之間休息（防 rate limit）
    await sleep(3000 + Math.random() * 2000);
  }

  // ── 完成 ──
  console.log(`\n🎉 完成！共加入 ${total} 個群組`);

  const finalLog = {
    date: new Date().toISOString(),
    total,
    keywords: KEYWORDS,
    max_per_keyword: MAX_PER_KEYWORD,
    target: TARGET_COUNT,
    groups: joined,
    keywords_done: log.keywords_done
  };
  saveJoinedLog(finalLog);
  console.log(`📝 記錄已保存: ${JOINED_LOG}`);

  // 截圖
  await page.screenshot({ path: '/tmp/fb_search_join_v3_done.png' });
  console.log('📸 截圖: /tmp/fb_search_join_v3_done.png');
}

main().catch(e => {
  console.error('❌ 錯誤:', e.message);
  process.exit(1);
});
