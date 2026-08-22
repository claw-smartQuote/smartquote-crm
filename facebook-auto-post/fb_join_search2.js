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
  
  // 登入
  console.log('🔐 登入...');
  await page.goto('https://www.facebook.com', { waitUntil: 'load', timeout: 30000 });
  await sleep(3000);
  
  // 嘗試填寫登入表單
  const emailField = await page.$('input[name="email"]');
  const passField = await page.$('input[name="pass"]');
  
  if (emailField && passField) {
    console.log('📝 填寫登入資料...');
    await emailField.fill(EMAIL);
    await sleep(600);
    await passField.fill(PASSWORD);
    await sleep(600);
    
    // 點擊登入
    const loginBtn = await page.$('button[name="login"], button[type="submit"]');
    if (loginBtn) {
      await loginBtn.click();
      console.log('⏳ 等待登入...');
      await sleep(6000);
    }
  } else {
    console.log('⚠️ 未找到登入表單');
  }
  
  console.log('✅ 登入完成');
  
  const joined = [];
  let total = 0;
  
  for (const kw of KEYWORDS) {
    if (total >= TARGET_COUNT) break;
    
    console.log(`\n🔍 搜索: ${kw}`);
    await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(kw)}`, { waitUntil: 'load' });
    await sleep(3500);
    
    // 滾動加載
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(1500);
    }
    
    // 點擊加入
    let clicked = 0;
    while (clicked < 5 && total < TARGET_COUNT) {
      const result = await page.evaluate(() => {
        // 找"加入"按鈕
        const all = Array.from(document.querySelectorAll('*'));
        for (const el of all) {
          if (el.childNodes.length === 1 && 
              el.textContent.trim() === '加入' && 
              el.getBoundingClientRect().width > 0) {
            el.click();
            return true;
          }
        }
        return false;
      });
      
      if (result) {
        clicked++;
        total++;
        console.log(`  ✅ 加入 #${total}`);
        await sleep(2500);
      } else {
        break;
      }
      
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1200);
    }
    
    console.log(`  📊 [${kw}] +${clicked}, 總計: ${total}`);
  }
  
  console.log(`\n🎉 完成！共加入 ${total} 個群組`);
  
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
