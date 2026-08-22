/**
 * 港車北上群組自動加入腳本 v2 - 通過搜索框搜索
 */
const { chromium } = require('playwright');

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

const TARGET_COUNT = 50;
const JOIN_PER_KEYWORD = 5;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('啟動 Chromium...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  
  const page = await context.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.navigator.chrome = { runtime: {}, app: {} };
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
      ],
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
  });
  
  console.log('打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  
  // 檢查是否登入
  if (page.url().includes('login')) {
    console.log('需要登入...');
    await page.fill('input[name="email"]', 'to@smartquote.cn');
    await page.fill('input[name="pass"]', 'Pin4fb123#');
    await page.click('button[name="login"]');
    await sleep(5000);
  }
  console.log('當前 URL:', page.url());
  
  // 找到搜索框並搜索
  console.log('\n嘗試找到搜索框...');
  
  // 嘗試多個搜索框選擇器
  const searchSelectors = [
    'input[placeholder="搜尋 Facebook"]',
    'input[placeholder="搜索"]',
    'input[aria-label="搜尋 Facebook"]',
    '[role="searchbox"]',
    'input[type="search"]'
  ];
  
  let searchInput = null;
  for (const sel of searchSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        searchInput = el;
        console.log('找到搜索框:', sel);
        break;
      }
    } catch (e) {}
  }
  
  if (!searchInput) {
    // 截圖看看頁面長什麼樣
    await page.screenshot({ path: 'no_search_box.png' });
    console.log('找不到搜索框，已截圖');
    
    // 嘗試直接按 / 鍵激活搜索
    await page.keyboard.press('/');
    await sleep(1000);
  }
  
  let totalJoined = 0;
  
  for (const keyword of KEYWORDS) {
    if (totalJoined >= TARGET_COUNT) break;
    
    console.log(`\n搜索: ${keyword}`);
    
    try {
      // 方法1: 直接用 URL
      const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      
      console.log('搜索 URL:', page.url());
      
      // 滾動載入更多內容
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 400));
        await sleep(800);
      }
      
      // 找群組卡片
      const groupCards = await page.locator('[href*="/groups/"]').all();
      console.log(`找到 ${groupCards.length} 個群組連結`);
      
      // 找加入按鈕
      const joinBtns = await page.locator('text=/加入|Join/i').all();
      console.log(`找到 ${joinBtns.length} 個加入按鈕`);
      
      let joinedThis = 0;
      for (const btn of joinBtns) {
        if (totalJoined >= TARGET_COUNT || joinedThis >= JOIN_PER_KEYWORD) break;
        
        try {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          await sleep(2000);
          totalJoined++;
          joinedThis++;
          console.log(`✓ 加入成功 (${totalJoined}/${TARGET_COUNT})`);
          await sleep(1500);
        } catch (e) {
          // 按鈕可能被其他元素蓋住，嘗試 JavaScript 點擊
          try {
            await page.evaluate((el) => el.click(), await btn.elementHandle());
          } catch (e2) {}
        }
      }
      
    } catch (e) {
      console.log('搜索出錯:', e.message);
    }
    
    await sleep(2000);
  }
  
  console.log(`\n完成！總共加入 ${totalJoined} 個群組`);
  
  const fs = require('fs');
  fs.writeFileSync('hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    total: totalJoined
  }, null, 2));
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e);
  process.exit(1);
});
