const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const KEYWORDS = [
  '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
  '大灣區車', '珠海北上', '深圳北上', '保姆車北上', '七人車'
];

const TARGET_COUNT = 50;
const GROUPS_PER_KEYWORD = 5;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function clickJoinButton(page) {
  return await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.childNodes.length === 1 && el.textContent.trim() === '加入') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.click();
          return true;
        }
      }
    }
    return false;
  });
}

async function getGroupName(page) {
  try {
    return await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent.trim() : '';
    });
  } catch {
    return '';
  }
}

async function joinGroups() {
  console.log('🔌 連接 Chrome 調試模式...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('✅ 已連接，開始搜索群組...\n');
  
  const joinedGroups = [];
  let total = 0;
  
  for (const keyword of KEYWORDS) {
    if (total >= TARGET_COUNT) break;
    
    console.log(`\n🔍 [${keyword}] 搜索中...`);
    
    const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    
    // 滾動加載
    for (let scroll = 0; scroll < 4; scroll++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(1500);
    }
    
    let joinedThis = 0;
    let attempts = 0;
    
    while (joinedThis < GROUPS_PER_KEYWORD && total < TARGET_COUNT && attempts < 15) {
      attempts++;
      
      // 嘗試點擊加入
      const clicked = await clickJoinButton(page);
      
      if (clicked) {
        const name = await getGroupName(page);
        joinedThis++;
        total++;
        joinedGroups.push({ name, keyword, time: new Date().toISOString() });
        console.log(`  ✅ 加入 #${total}: ${name || '未知群組'}`);
        await sleep(3000);
      }
      
      // 滾動
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(1200);
    }
    
    console.log(`  📊 [${keyword}] +${joinedThis} 個`);
  }
  
  console.log(`\n🎉 完成！共加入 ${total} 個群組`);
  
  // 保存結果
  const resultFile = path.join(WORK_DIR, 'hk_north_joined_50.json');
  fs.writeFileSync(resultFile, JSON.stringify({
    date: new Date().toISOString(),
    total,
    groups: joinedGroups
  }, null, 2));
  console.log(`📁 結果: ${resultFile}`);
  
  await browser.close();
}

joinGroups().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
