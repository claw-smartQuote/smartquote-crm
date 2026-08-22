const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function loginAndJoin() {
  console.log('🔌 連接 Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('URL:', page.url());
  await page.screenshot({ path: path.join(WORK_DIR, 'step01_home.png') });
  
  // 檢查是否已登入
  const url = page.url();
  if (url.includes('login') || url.includes('checkpoint')) {
    console.log('⚠️ 需要登入');
    
    const emailInput = await page.$('input[name="email"]');
    const passInput = await page.$('input[name="pass"]');
    
    if (emailInput && passInput) {
      console.log('📝 填寫登入資料...');
      await emailInput.fill(EMAIL);
      await sleep(500);
      await passInput.fill(PASSWORD);
      await sleep(500);
      await page.screenshot({ path: path.join(WORK_DIR, 'step02_filled.png') });
      
      await page.press('input[name="pass"]', 'Enter');
      console.log('⏳ 等待登入...');
      await sleep(8000);
      await page.screenshot({ path: path.join(WORK_DIR, 'step03_after_login.png') });
      console.log('URL:', page.url());
    }
  } else {
    console.log('✅ 已登入');
  }
  
  // 測試搜索群組
  console.log('\n🔍 測試搜索...');
  await page.goto('https://www.facebook.com/search/groups/?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A', { waitUntil: 'networkidle' });
  await sleep(3000);
  await page.screenshot({ path: path.join(WORK_DIR, 'step04_search.png') });
  console.log('搜索結果頁面已截圖');
  
  console.log('\n✅ 測試完成！');
  
  await browser.close();
}

loginAndJoin().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
