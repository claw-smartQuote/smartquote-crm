const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🔌 連接 Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  
  // 列出所有 existing targets
  console.log('📋 可用的頁面:');
  const pages = await browser.contexts()[0]?.pages() || [];
  console.log('  已有頁面數:', pages.length);
  
  // 創建新頁面
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 直接訪問 Facebook 搜索頁面
  console.log('\n🔍 訪問搜索頁面...');
  await page.goto('https://www.facebook.com/search/groups/?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  
  // 截圖
  await page.screenshot({ path: path.join(WORK_DIR, 'debug_search.png'), fullPage: false });
  
  // 看看頁面內容
  const content = await page.content();
  console.log('頁面大小:', content.length, '字符');
  
  // 檢查是否有群組結果
  const hasResults = await page.evaluate(() => {
    // 找所有連結
    const links = document.querySelectorAll('a[href*="/groups/"]');
    return {
      count: links.length,
      first: links[0]?.href || ''
    };
  });
  console.log('群組連結數:', hasResults.count);
  
  // 找加入按鈕
  const buttons = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const joinBtns = [];
    for (const el of all) {
      if (el.childNodes.length === 1 && el.textContent.trim() === '加入') {
        joinBtns.push({
          text: el.textContent,
          visible: el.offsetWidth > 0,
          rect: el.getBoundingClientRect()
        });
      }
    }
    return joinBtns;
  });
  console.log('加入按鈕數:', buttons.length);
  
  if (buttons.length > 0) {
    console.log('第一個按鈕:', JSON.stringify(buttons[0]));
  }
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
