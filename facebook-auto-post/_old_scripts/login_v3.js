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
  
  console.log('🔐 前往 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  
  // 看看是否已經登入
  const url = page.url();
  console.log('URL:', url);
  await page.screenshot({ path: path.join(WORK_DIR, 'check01.png') });
  
  if (url.includes('login')) {
    console.log('需要登入...');
    
    // 填寫 email
    const emailInput = await page.$('input[name="email"]');
    if (emailInput) {
      console.log('填寫 email...');
      await emailInput.fill(EMAIL);
      await sleep(500);
    }
    
    // 填寫密碼
    const passInput = await page.$('input[name="pass"]');
    if (passInput) {
      console.log('填寫密碼...');
      await passInput.fill(PASSWORD);
      await sleep(500);
    }
    
    await page.screenshot({ path: path.join(WORK_DIR, 'check02.png') });
    
    // 用 JavaScript 點擊提交
    console.log('提交...');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.submit();
    });
    
    await sleep(6000);
    console.log('URL:', page.url());
    await page.screenshot({ path: path.join(WORK_DIR, 'check03.png') });
  } else {
    console.log('✅ 已經登入！');
  }
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
