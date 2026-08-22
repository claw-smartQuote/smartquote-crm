const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const KEYWORDS = [
  '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
  '大灣區車', '珠海北上', '深圳北上', '保姆車', '七人車'
];

const TARGET_COUNT = 50;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function clickJoinButtons(page) {
  // 用 JavaScript 遍歷頁面找"加入"按鈕
  return await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const buttons = [];
    
    for (const el of all) {
      // 只看葉子節點（只有一個文字節點的div/span）
      if (el.childNodes.length === 1 && el.nodeType === 1) {
        const text = el.textContent.trim();
        if (text === '加入' || text === '加入群組') {
          // 檢查可見
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
            buttons.push({ text, top: rect.top });
          }
        }
      }
    }
    
    // 按位置排序（從上到下）
    buttons.sort((a, b) => a.top - b.top);
    
    if (buttons.length > 0) {
      // 點擊第一個
      const el = Array.from(document.querySelectorAll('*')).find(e => 
        e.childNodes.length === 1 && 
        e.textContent.trim() === '加入' &&
        e.getBoundingClientRect().top === buttons[0].top
      );
      if (el) {
        el.click();
        return 1;
      }
    }
    return 0;
  });
}

async function joinGroups() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 登入
  console.log('🔐 登入...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  
  // 截圖確認
  await page.screenshot({ path: path.join(WORK_DIR, 'fb01_login.png') });
  
  // 用 name 屬性找輸入框
  await page.fill('input[name="email"]', EMAIL);
  await sleep(500);
  await page.fill('input[name="pass"]', PASSWORD);
  await sleep(500);
  
  // 截圖確認
  await page.screenshot({ path: path.join(WORK_DIR, 'fb02_filled.png') });
  
  // 按 Enter 提交
  await page.press('input[name="pass"]', 'Enter');
  console.log('⏳ 等待登入...');
  await sleep(8000);
  
  // 截圖確認
  await page.screenshot({ path: path.join(WORK_DIR, 'fb03_after_login.png') });
  
  console.log('✅ 登入完成');
  console.log('URL:', page.url());
  
  const joined = [];
  let total = 0;
  
  for (const kw of KEYWORDS) {
    if (total >= TARGET_COUNT) break;
    
    console.log(`\n🔍 搜索: ${kw}`);
    await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    
    // 截圖搜索結果
    await page.screenshot({ path: path.join(WORK_DIR, `fb_search_${kw}.png`) });
    
    // 滾動加載
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1500);
    }
    
    let clicked = 0;
    for (let attempt = 0; attempt < 10 && clicked < 5 && total < TARGET_COUNT; attempt++) {
      const count = await clickJoinButtons(page);
      if (count > 0) {
        clicked++;
        total++;
        console.log(`  ✅ 加入 #${total}`);
        await sleep(3000);
      }
      
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1500);
    }
    
    console.log(`  📊 [${kw}] +${clicked}`);
  }
  
  console.log(`\n🎉 完成！共加入 ${total} 個群組`);
  
  fs.writeFileSync(
    path.join(WORK_DIR, 'hk_north_joined_result.json'),
    JSON.stringify({ date: new Date().toISOString(), total, joined }, null, 2)
  );
  
  await browser.close();
}

joinGroups().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
