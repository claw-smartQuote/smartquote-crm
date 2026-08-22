const { chromium } = require('playwright');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function findJoinButton(page) {
  return await page.evaluate(() => {
    // 方法1: aria-label
    let el = document.querySelector('[aria-label="加入群組"]');
    if (el && el.offsetWidth > 0) {
      el.click();
      return 'aria-label';
    }
    
    // 方法2: 精確文字匹配 "加入"
    const all = document.querySelectorAll('div, span');
    for (const e of all) {
      if (e.childNodes.length === 1 && e.textContent.trim() === '加入') {
        const rect = e.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          e.click();
          return 'exact-text';
        }
      }
    }
    
    return null;
  });
}

async function main() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  console.log('URL:', page.url());
  
  // 搜索群組
  console.log('\n🔍 搜索: 港車北上');
  await page.goto('https://www.facebook.com/search/groups/?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A', { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'search01.png') });
  
  // 滾動
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 400));
    await sleep(1500);
  }
  
  // 找加入按鈕
  const result = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    const info = [];
    
    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text === '加入' || text === '加入群組') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) {
          info.push({
            tag: el.tagName,
            text,
            rect: { w: rect.width, h: rect.height, y: rect.top }
          });
        }
      }
    }
    
    return info;
  });
  
  console.log('找到元素:', JSON.stringify(result, null, 2));
  
  // 嘗試點擊
  const clicked = await findJoinButton(page);
  if (clicked) {
    console.log('✅ 點擊成功:', clicked);
    await sleep(3000);
    await page.screenshot({ path: path.join(WORK_DIR, 'search02_after_click.png') });
  } else {
    console.log('❌ 未找到加入按鈕');
  }
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
