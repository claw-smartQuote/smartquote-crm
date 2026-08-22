const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD = 'Pin4fb123#';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const KEYWORDS = [
  '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
  '大灣區車', '保姆車', '七人車', '珠海北上', '深圳北上'
];

const TARGET_COUNT = 50;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function humanDelay(min, max) {
  const delay = Math.random() * (max - min) + min;
  await sleep(delay);
}

async function joinGroups() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  // 登入
  console.log('🔐 登入 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
  await humanDelay(1000, 2000);
  
  // 填寫登入資料
  const emailInput = await page.$('input[name="email"]');
  const passInput = await page.$('input[name="pass"]');
  
  if (emailInput && passInput) {
    await emailInput.fill(EMAIL);
    await humanDelay(300, 600);
    await passInput.fill(PASSWORD);
    await humanDelay(300, 600);
    
    // 點擊登入按鈕
    const loginBtn = await page.$('button[name="login"]');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForTimeout(3000);
    }
  }
  
  console.log('✅ 登入完成');
  
  const joinedGroups = [];
  
  for (const keyword of KEYWORDS) {
    if (joinedGroups.length >= TARGET_COUNT) break;
    
    console.log(`\n🔍 搜索關鍵詞: ${keyword}`);
    
    // 搜索群組
    const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle' });
    await humanDelay(2000, 3000);
    
    // 滾動加載更多結果
    for (let scroll = 0; scroll < 3; scroll++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await humanDelay(800, 1500);
    }
    
    // 找加入按鈕
    let joinedCount = 0;
    let attempts = 0;
    
    while (joinedCount < 5 && attempts < 20 && joinedGroups.length < TARGET_COUNT) {
      attempts++;
      
      // 找 "加入" 按鈕
      const joinButtons = await page.$$('div[aria-label="加入群組"]');
      
      if (joinButtons.length === 0) {
        // 嘗試其他按鈕文字
        const allButtons = await page.$$('div[role="button"]');
        for (const btn of allButtons) {
          const text = await btn.textContent();
          if (text && text.trim() === '加入') {
            joinButtons.push(btn);
          }
        }
      }
      
      for (const btn of joinButtons) {
        if (joinedGroups.length >= TARGET_COUNT) break;
        
        try {
          const isVisible = await btn.isVisible();
          if (!isVisible) continue;
          
          await btn.click();
          joinedCount++;
          
          const groupInfo = await getGroupInfo(page);
          if (groupInfo) {
            joinedGroups.push(groupInfo);
            console.log(`  ✅ 已加入: ${groupInfo.name} (${joinedGroups.length}/${TARGET_COUNT})`);
          }
          
          await humanDelay(1500, 3000);
        } catch (e) {
          // 按鈕可能已經變化
        }
      }
      
      // 滾動加載更多
      await page.evaluate(() => window.scrollBy(0, 400));
      await humanDelay(1000, 2000);
    }
  }
  
  console.log(`\n✅ 完成！共加入 ${joinedGroups.length} 個群組`);
  
  // 保存結果
  const resultFile = path.join(WORK_DIR, 'hk_north_groups_joined.json');
  fs.writeFileSync(resultFile, JSON.stringify(joinedGroups, null, 2));
  console.log(`📁 已保存到: ${resultFile}`);
  
  // 保存 session
  const sessionFile = path.join(WORK_DIR, 'fb_session.json');
  await context.storageState({ path: sessionFile });
  console.log(`🔑 Session 已保存: ${sessionFile}`);
  
  await browser.close();
}

async function getGroupInfo(page) {
  try {
    // 嘗試獲取群組名稱
    const titleEl = await page.$('div[role="article"] h3');
    const name = titleEl ? await titleEl.textContent() : '未知群組';
    
    // 嘗試獲取 URL
    const linkEl = await page.$('div[role="article"] a[href*="/groups/"]');
    const url = linkEl ? await linkEl.getAttribute('href') : '';
    
    return { name: name.trim(), url };
  } catch {
    return null;
  }
}

joinGroups().catch(console.error);
