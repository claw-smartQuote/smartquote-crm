const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('🔐 登入 Facebook...');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  await sleep(1500);
  
  await page.fill('input[name="email"]', EMAIL);
  await sleep(500);
  await page.fill('input[name="pass"]', PASSWORD);
  await sleep(500);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'before_login.png') });
  
  // 點擊登入
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });
  
  console.log('⏳ 等待登入...');
  await sleep(8000);
  
  const url = page.url();
  console.log('URL:', url);
  await page.screenshot({ path: path.join(WORK_DIR, 'after_login.png') });
  
  // 檢查是否跳轉到驗證頁
  if (url.includes('two_step') || url.includes('verification') || url.includes('checkpoint')) {
    console.log('⚠️ 需要雙重驗證！');
    console.log('請在瀏覽器中完成驗證，然後回覆我...');
    
    // 保存 cookies 以防萬一
    const cookies = await context.cookies();
    fs.writeFileSync(path.join(WORK_DIR, 'cookies_pending.json'), JSON.stringify(cookies, null, 2));
    
    // 等待手動驗證
    await sleep(120000);
  }
  
  // 保存 cookies
  const cookies = await context.cookies();
  fs.writeFileSync(path.join(WORK_DIR, 'fb_cookies.json'), JSON.stringify(cookies, null, 2));
  console.log('✅ Cookies 已保存');
  
  // 測試訪問群組頁面
  console.log('\n📍 測試訪問群組頁面...');
  const page2 = await context.newPage();
  await page2.goto('https://www.facebook.com/groups/758082796210463', { waitUntil: 'networkidle' });
  await sleep(3000);
  console.log('URL:', page2.url());
  await page2.screenshot({ path: path.join(WORK_DIR, 'test_group.png') });
  
  if (!page2.url().includes('login')) {
    console.log('✅ 可以訪問群組頁面！');
  }
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
