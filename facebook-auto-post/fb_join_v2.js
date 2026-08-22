const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const KEYWORDS = [
  '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
  '大灣區車', '保姆車', '七人車', '珠海北上', '深圳北上'
];

const TARGET_COUNT = 50;
const GROUPS_PER_KEYWORD = 5;

async function sleep(ms) {
  return new Promise(r => setTimeout(ms));
}

async function humanDelay(min, max) {
  await sleep(Math.random() * (max - min) + min);
}

async function joinGroups() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ 
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // 登入
  console.log('🔐 登入 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await humanDelay(1500, 2500);
  
  const emailInput = await page.$('input[name="email"]');
  const passInput = await page.$('input[name="pass"]');
  
  if (emailInput && passInput) {
    await emailInput.fill(EMAIL);
    await humanDelay(400, 700);
    await passInput.fill(PASSWORD);
    await humanDelay(400, 700);
    
    await page.click('button[name="login"]');
    console.log('⏳ 等待登入...');
    await page.waitForTimeout(4000);
  }
  
  console.log('✅ 登入完成');
  
  const joinedGroups = [];
  let totalJoined = 0;
  
  for (const keyword of KEYWORDS) {
    if (totalJoined >= TARGET_COUNT) break;
    
    console.log(`\n🔍 [${keyword}] 搜索中...`);
    
    const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await humanDelay(2000, 3500);
    
    // 滾動
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await humanDelay(800, 1500);
    }
    
    let joinedThisKeyword = 0;
    let scrollCount = 0;
    
    while (joinedThisKeyword < GROUPS_PER_KEYWORD && totalJoined < TARGET_COUNT && scrollCount < 10) {
      scrollCount++;
      
      // 嘗試多種按鈕選擇器
      const selectors = [
        'div[aria-label="加入群組"]',
        'span:has-text("加入")',
        'div[role="button"]:has-text("加入")'
      ];
      
      let foundButtons = [];
      for (const sel of selectors) {
        try {
          const btns = await page.$$(sel);
          if (btns.length > 0) foundButtons = btns;
        } catch {}
      }
      
      console.log(`  找到 ${foundButtons.length} 個加入按鈕`);
      
      for (const btn of foundButtons) {
        if (joinedThisKeyword >= GROUPS_PER_KEYWORD || totalJoined >= TARGET_COUNT) break;
        
        try {
          const isVisible = await btn.isVisible();
          if (!isVisible) continue;
          
          // 獲取群組連結
          const groupLink = await page.$('a[href*="/groups/"][aria-label="群組"]');
          let groupUrl = '';
          if (groupLink) groupUrl = await groupLink.getAttribute('href');
          
          await btn.click();
          joinedThisKeyword++;
          totalJoined++;
          
          console.log(`  ✅ 已加入 #${totalJoined}: ${groupUrl.substring(0, 60)}...`);
          
          await humanDelay(2000, 3500);
        } catch (e) {
          // 忽略
        }
      }
      
      // 滾動加載更多
      await page.evaluate(() => window.scrollBy(0, 400));
      await humanDelay(1000, 2000);
    }
    
    console.log(`  📊 [${keyword}] 本輪加入: ${joinedThisKeyword} 個`);
  }
  
  console.log(`\n🎉 完成！共加入 ${totalJoined} 個群組`);
  
  // 保存結果
  const resultFile = path.join(WORK_DIR, 'hk_north_groups_joined_v2.json');
  fs.writeFileSync(resultFile, JSON.stringify({ 
    date: new Date().toISOString(),
    total: totalJoined,
    groups: joinedGroups 
  }, null, 2));
  
  // 保存 session
  const sessionFile = path.join(WORK_DIR, 'fb_session_v2.json');
  await context.storageState({ path: sessionFile });
  
  console.log(`📁 結果: ${resultFile}`);
  console.log(`🔑 Session: ${sessionFile}`);
  
  await browser.close();
}

joinGroups().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
