const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const statePath = './fb_session_logged_in.json';
  const storageState = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: storageState
  });

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  if (await page.$('input[name="email"]')) {
    console.log('❌ 需要重新登入');
    await browser.close();
    return;
  }
  console.log('✅ 已登入\n');
  
  // Navigate to groups page first
  console.log('📱 前往群組頁面...');
  await page.goto('https://www.facebook.com/groups', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/fb_groups_page.png' });
  console.log('📸 群組頁面: /tmp/fb_groups_page.png');
  
  // Now search
  console.log('\n🔍 搜索港車北上...');
  await page.goto(
    'https://www.facebook.com/search/groups?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A',
    { waitUntil: 'domcontentloaded' }
  );
  await page.waitForTimeout(3000);
  
  // Scroll
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
  }
  
  await page.screenshot({ path: '/tmp/fb_search_result.png', fullPage: true });
  console.log('📸 搜索結果: /tmp/fb_search_result.png');
  
  // Find ALL join buttons using JavaScript evaluation
  const joinButtonInfo = await page.evaluate(() => {
    const results = [];
    
    // Look for common join button patterns
    const selectors = [
      'div[aria-label="加入群組"]',
      'div[aria-label="加入"]', 
      '[role="button"]',
      'div[tabindex="0"]'
    ];
    
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        els.forEach((el, i) => {
          const text = el.innerText?.trim() || '';
          const rect = el.getBoundingClientRect();
          if (text && (text.includes('加入') || text.includes('Join')) && rect.width > 0) {
            results.push({
              selector: sel,
              index: i,
              text: text.substring(0, 50),
              visible: rect.width > 0 && rect.height > 0,
              x: rect.x, y: rect.y, w: rect.width, h: rect.height
            });
          }
        });
      }
    }
    
    return results.slice(0, 20);
  });
  
  console.log('\n找到的加入按鈕:');
  joinButtonInfo.forEach((btn, i) => {
    console.log(`  ${i+1}. "${btn.text}" (${btn.w}x${btn.h}) visible=${btn.visible}`);
  });
  
  // Try to click using JavaScript directly
  if (joinButtonInfo.length > 0) {
    console.log('\n嘗試點擊第一個按鈕...');
    
    // Use page.evaluate to click
    await page.evaluate((btnInfo) => {
      const els = document.querySelectorAll(btnInfo.selector);
      if (els[btnInfo.index]) {
        els[btnInfo.index].click();
      }
    }, joinButtonInfo[0]);
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/fb_after_click.png' });
    console.log('📸 點擊後: /tmp/fb_after_click.png');
  }
  
  await new Promise(r => setTimeout(r, 10000));
  await browser.close();
})();
