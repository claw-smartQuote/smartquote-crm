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
const MAX_PER_KEYWORD = 5;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function findAndClickJoin(page) {
  // 嘗試多种方式找加入按鈕
  const result = await page.evaluate(() => {
    // 方法1: 找 aria-label="加入群組" 的元素
    let el = document.querySelector('[aria-label="加入群組"]');
    if (el) { el.click(); return 'aria-label'; }
    
    // 方法2: 找包含"加入"文字的 span/div
    const all = document.querySelectorAll('span, div');
    for (const e of all) {
      if (e.textContent.trim() === '加入' && e.offsetWidth > 0) {
        e.click();
        return 'text-match';
      }
    }
    
    // 方法3: 找 text=加入 的元素
    const xpath = document.evaluate(
      "//*[contains(text(),'加入') and not(contains(text(),'加入群組'))]",
      document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
    );
    for (let i = 0; i < xpath.snapshotLength; i++) {
      const e = xpath.snapshotItem(i);
      if (e.offsetWidth > 0 && e.textContent.trim().length < 5) {
        e.click();
        return 'xpath';
      }
    }
    
    return null;
  });
  
  return result !== null;
}

async function main() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  console.log('🔐 登入 Facebook...');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  
  await page.fill('#email', EMAIL);
  await sleep(400);
  await page.fill('#pass', PASSWORD);
  await sleep(400);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'login_page.png') });
  
  await page.click('button[name="login"]');
  console.log('⏳ 等待驗證...');
  await sleep(6000);
  
  const url = page.url();
  console.log('URL:', url);
  await page.screenshot({ path: path.join(WORK_DIR, 'after_login.png') });
  
  if (url.includes('two_step') || url.includes('verification') || url.includes('checkpoint')) {
    console.log('⚠️ 需要雙重驗證！請在瀏覽器中完成驗證，然後告訴我...');
    console.log('等待驗證完成（60秒）...');
    await sleep(60000);
  }
  
  console.log('✅ 登入完成');
  
  // 開始加入群組
  const joined = [];
  let total = 0;
  
  for (const keyword of KEYWORDS) {
    if (total >= TARGET_COUNT) break;
    
    console.log(`\n🔍 [${keyword}] 搜索中...`);
    
    await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    
    // 滾動加載
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1500);
    }
    
    let joinedThis = 0;
    
    for (let attempt = 0; attempt < 10 && joinedThis < MAX_PER_KEYWORD && total < TARGET_COUNT; attempt++) {
      const clicked = await findAndClickJoin(page);
      
      if (clicked) {
        joinedThis++;
        total++;
        console.log(`  ✅ 加入 #${total}`);
        await sleep(3000);
      } else {
        // 滾動再試
        await page.evaluate(() => window.scrollBy(0, 300));
        await sleep(1200);
      }
    }
    
    console.log(`  📊 [${keyword}] +${joinedThis}`);
  }
  
  console.log(`\n🎉 完成！共加入 ${total} 個群組`);
  
  // 保存
  fs.writeFileSync(path.join(WORK_DIR, 'joined_result.json'), JSON.stringify({
    date: new Date().toISOString(),
    total,
    groups: joined
  }, null, 2));
  
  await page.screenshot({ path: path.join(WORK_DIR, 'final.png') });
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
