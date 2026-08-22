const { chromium } = require('playwright');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🚀 啟動...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 直接訪問群組頁面
  console.log('📍 訪問群組頁面...');
  await page.goto('https://www.facebook.com/groups/758082796210463', { waitUntil: 'networkidle' });
  await sleep(4000);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'group_page.png') });
  console.log('URL:', page.url());
  
  // 找加入按鈕
  const joinBtn = await page.evaluate(() => {
    // 嘗試各种选择器
    const selectors = [
      '[aria-label="加入群組"]',
      '[aria-label="加入"]',
      'div:has-text("加入")'
    ];
    
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 0) {
        return { found: sel, text: el.textContent.trim() };
      }
    }
    
    // 最後嘗試 JS 遍歷
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.childNodes.length === 1 && el.textContent.trim() === '加入') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) {
          return { found: 'js-iterate', text: '加入' };
        }
      }
    }
    
    return { found: 'none' };
  });
  
  console.log('加入按鈕:', JSON.stringify(joinBtn));
  
  await browser.close();
}

main().catch(e => console.error('錯誤:', e.message));
