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
  
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  
  console.log('\n🔍 搜索: 港車北上');
  await page.goto('https://www.facebook.com/search/groups/?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A', { waitUntil: 'networkidle' });
  await sleep(5000);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'groups01.png'), fullPage: false });
  
  // 滾動
  await page.evaluate(() => window.scrollBy(0, 500));
  await sleep(2000);
  await page.screenshot({ path: path.join(WORK_DIR, 'groups02.png'), fullPage: false });
  
  // 找所有按鈕
  const buttons = await page.evaluate(() => {
    const btns = document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]');
    return Array.from(btns).slice(0, 20).map(b => ({
      text: b.textContent?.trim().substring(0, 50),
      ariaLabel: b.getAttribute('aria-label'),
      role: b.getAttribute('role')
    }));
  });
  console.log('按鈕:', JSON.stringify(buttons, null, 2));
  
  // 找群組連結
  const groupLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/groups/"]');
    return Array.from(links).slice(0, 5).map(l => ({
      href: l.href,
      text: l.textContent?.trim().substring(0, 50)
    }));
  });
  console.log('群組連結:', JSON.stringify(groupLinks, null, 2));
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
