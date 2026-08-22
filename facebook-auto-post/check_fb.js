const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  
  // 截圖
  await page.screenshot({ path: '/Users/claw/.openclaw/workspace/facebook-auto-post/fb_check.png' });
  
  // 看看有哪些 input
  const inputs = await page.$$eval('input', els => els.map(e => ({name: e.name, type: e.type, id: e.id})));
  console.log('Inputs:', JSON.stringify(inputs, null, 2));
  
  await browser.close();
})();
