const { chromium } = require('playwright');
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
  const page = await browser.newPage();
  
  console.log('🔐 前往登入頁...');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  
  // 等待頁面完全載入
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  await sleep(1500);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'login01.png') });
  
  console.log('📝 填寫資料...');
  await page.fill('input[name="email"]', EMAIL);
  await sleep(600);
  await page.fill('input[name="pass"]', PASSWORD);
  await sleep(600);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'login02.png') });
  
  console.log('✅ 提交登入...');
  await page.click('button[name="login"]');
  
  await sleep(8000);
  
  const url = page.url();
  console.log('URL:', url);
  await page.screenshot({ path: path.join(WORK_DIR, 'login03.png') });
  
  if (url.includes('login') || url.includes('checkpoint')) {
    console.log('⚠️ 檢查是否需要驗證...');
    if (url.includes('two_step') || url.includes('verification')) {
      console.log('需要雙重驗證！請在瀏覽器中完成，然後回覆我...');
    }
  } else {
    console.log('✅ 登入成功！');
  }
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
