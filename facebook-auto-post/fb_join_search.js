const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const KEYWORDS = [
  '港車北上 群組', '兩地牌 車 群', '中港車 討論',
  '跨境車 港車', '大灣區 車主', '北上 珠海 深圳'
];

const TARGET_COUNT = 50;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function joinGroups() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  
  // 登入
  console.log('🔐 登入...');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  
  await page.fill('#email', EMAIL);
  await sleep(500);
  await page.fill('#pass', PASSWORD);
  await sleep(500);
  await page.click('button[name="login"]');
  await sleep(6000);
  
  console.log('✅ 登入完成');
  
  const joined = [];
  let total = 0;
  
  for (const kw of KEYWORDS) {
    if (total >= TARGET_COUNT) break;
    
    console.log(`\n🔍 搜索: ${kw}`);
    await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    
    // 滾動
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1200);
    }
    
    // 用 evaluate 找所有加入按鈕並點擊
    let clicked = 0;
    while (clicked < 5 && total < TARGET_COUNT) {
      const result = await page.evaluate(() => {
        // 找所有包含"加入"文字的元素
        const elements = document.querySelectorAll('*');
        const joinBtns = [];
        
        for (const el of elements) {
          if (el.childNodes.length === 1 && el.textContent.trim() === '加入') {
            // 檢查是否可見
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              joinBtns.push(el);
            }
          }
        }
        
        if (joinBtns.length > 0) {
          joinBtns[0].click();
          return { clicked: true, count: joinBtns.length };
        }
        return { clicked: false, count: 0 };
      });
      
      if (result.clicked) {
        clicked++;
        total++;
        console.log(`  ✅ 加入 #${total}`);
        await sleep(2500);
      } else {
        break;
      }
      
      await page.evaluate(() => window.scrollBy(0, 300));
      await sleep(1000);
    }
    
    console.log(`  📊 [${kw}] +${clicked}`);
  }
  
  console.log(`\n🎉 完成！共加入 ${total} 個群組`);
  
  // 保存
  fs.writeFileSync(
    path.join(WORK_DIR, 'hk_north_joined_final.json'),
    JSON.stringify({ date: new Date().toISOString(), total, joined }, null, 2)
  );
  
  await browser.close();
}

joinGroups().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
