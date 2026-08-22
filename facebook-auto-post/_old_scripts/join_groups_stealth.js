/**
 * 港車北上群組自動加入腳本 - Stealth Mode
 * 繞過 Facebook 自動化檢測
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
const JOIN_PER_KEYWORD = 5; // 每個關鍵詞最多加入5個

async function main() {
  console.log('啟動 Stealth Chromium...');
  
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
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-destructive-tests',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-crashpad',
      '--disable-features=IsolateOrigins,site-per-process',
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    permissions: ['geolocation'],
  });
  
  const page = await context.newPage();
  
  // 注入 Stealth 腳本
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
    
    // 模擬 Automation 標記
    window.callPhantom = undefined;
    window._phantom = undefined;
    window.phantom = undefined;
  });
  
  // 移除 automation 標記
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  console.log('正在打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  let isLoggedIn = !page.url().includes('login');
  console.log('當前 URL:', page.url());
  
  if (!isLoggedIn) {
    console.log('需要登入...');
    try {
      await page.fill('input[name="email"]', 'to@smartquote.cn', { timeout: 5000 });
      await page.fill('input[name="pass"]', 'Pin4fb123#', { timeout: 5000 });
      await page.click('button[name="login"], [data-testid="royal_login_button"]');
      await page.waitForTimeout(5000);
      isLoggedIn = !page.url().includes('login');
      console.log('登入後 URL:', page.url());
    } catch (e) {
      console.log('登入失敗:', e.message);
    }
  } else {
    console.log('已登入');
  }
  
  if (!isLoggedIn) {
    console.log('無法登入，結束');
    await browser.close();
    return;
  }
  
  // 逐個關鍵詞搜索
  let totalJoined = 0;
  const joinedGroups = [];
  
  for (const keyword of KEYWORDS) {
    if (totalJoined >= TARGET_COUNT) break;
    
    console.log(`\n搜索關鍵詞: ${keyword}`);
    
    const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // 等待動態內容載入
    await page.waitForTimeout(3000);
    
    // 滾動頁面讓更多內容載入
    for (let scroll = 0; scroll < 3; scroll++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1500);
    }
    
    await page.screenshot({ path: `search_${keyword}.png`, fullPage: false });
    
    // 嘗試多種選擇器找「加入」按鈕
    const joinButtons = await page.locator('div[role="button"]:has-text("加入"), div[aria-label="加入"], span:has-text("加入")').all();
    
    console.log(`找到 ${joinButtons.length} 個加入按鈕`);
    
    let joinedThisKeyword = 0;
    
    for (let i = 0; i < Math.min(joinButtons.length, JOIN_PER_KEYWORD); i++) {
      if (totalJoined >= TARGET_COUNT) break;
      
      try {
        const btn = joinButtons[i];
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ timeout: 3000 });
        await page.waitForTimeout(2000);
        
        totalJoined++;
        joinedThisKeyword++;
        console.log(`✓ 已加入 (${totalJoined}/${TARGET_COUNT})`);
        
        // 等待加入成功的反饋
        await page.waitForTimeout(1500);
        
      } catch (e) {
        console.log(`加入失敗:`, e.message);
      }
    }
    
    if (joinedThisKeyword === 0) {
      // 嘗試找群組連結
      const groupLinks = await page.locator('a[href*="/groups/"]').all();
      console.log(`找到 ${groupLinks.length} 個群組連結`);
    }
    
    await page.waitForTimeout(2000);
  }
  
  console.log(`\n完成！總共加入 ${totalJoined} 個群組`);
  
  // 保存結果
  const fs = require('fs');
  fs.writeFileSync('hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    total: totalJoined,
    groups: joinedGroups
  }, null, 2));
  
  await browser.close();
}

main().catch(e => {
  console.error('腳本錯誤:', e);
  process.exit(1);
});
