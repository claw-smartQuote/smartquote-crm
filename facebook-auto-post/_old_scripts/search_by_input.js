const { chromium } = require('playwright');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 先去 Facebook 首頁
  await page.goto('https://www.facebook.com', { waitUntil: 'load' });
  await sleep(3000);
  
  // 嘗試使用搜索框
  console.log('🔍 嘗試搜索...');
  
  // 找搜索框
  const searchBox = await page.$('input[placeholder*="搜尋"], input[type="search"]');
  if (searchBox) {
    console.log('找到搜索框');
    await searchBox.fill('港車北上 群組');
    await sleep(1000);
    await page.keyboard.press('Enter');
    await sleep(5000);
  }
  
  await page.screenshot({ path: path.join(WORK_DIR, 'search_result.png') });
  
  console.log('URL:', page.url());
  
  // 看看有什麼連結
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .slice(0, 30)
      .map(a => ({
        href: a.href,
        text: a.textContent?.trim().substring(0, 50)
      }));
  });
  
  console.log('連結:', JSON.stringify(links.filter(l => l.href && l.text), null, 2));
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
