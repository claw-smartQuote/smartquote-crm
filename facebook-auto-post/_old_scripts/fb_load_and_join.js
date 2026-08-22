const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  // Read the saved state
  const statePath = './fb_session_logged_in.json';
  let storageState;
  
  try {
    storageState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    console.log(`📂 載入 session: ${storageState.cookies.length} cookies`);
  } catch (e) {
    console.log('❌ 無法讀取 session');
    await browser.close();
    return;
  }

  // Create context with saved cookies
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: storageState
  });

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const url = page.url();
  console.log('🔗 URL:', url);
  
  // Check if logged in
  const emailField = await page.$('input[name="email"]');
  if (emailField) {
    console.log('❌ Session 失效');
    await browser.close();
    return;
  }
  console.log('✅ 已登入！\n');
  
  const keywords = [
    '港車北上', '港車 北上', '兩地牌 汽車', '中港車', 
    '粵港車', '跨境車', '大灣區 車', '保姆車 北上',
    '七人車 北上', 'MPV 北上', 'SUV 北上', '珠海 北上',
    '深圳 北上', '广州 北上', '內地自駕', '港人 內地駕',
    '中港 車牌', '大陸 駕照', '車險 北上', '汽車保險 北上'
  ];
  
  let joinedCount = 0;
  let totalFound = 0;
  const joinedGroups = [];
  
  for (const kw of keywords) {
    console.log(`\n🔍 [${keywords.indexOf(kw)+1}/${keywords.length}] 搜索: "${kw}"`);
    
    await page.goto(
      `https://www.facebook.com/search/groups?q=${encodeURIComponent(kw)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    
    await page.waitForTimeout(2000);
    
    // Scroll aggressively
    await page.evaluate(() => window.scrollTo(0, 0));
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(400);
    }
    
    // Try clicking "See More" if exists
    try {
      const seeMore = await page.$('span:has-text("查看更多")');
      if (seeMore) {
        await seeMore.click();
        await page.waitForTimeout(1500);
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 300);
          await page.waitForTimeout(300);
        }
      }
    } catch (e) {}
    
    // Get unique group URLs
    const groupUrls = await page.$$eval('a[href*="/groups/"]', links => {
      const seen = new Set();
      return links.map(l => l.href).filter(h => {
        const m = h.match(/\/groups\/([a-zA-Z0-9]+)/);
        if (m && !seen.has(m[1])) { seen.add(m[1]); return true; }
        return false;
      }).slice(0, 20);
    });
    
    // Find join buttons
    let joinBtns = [];
    for (const sel of ['div[aria-label="加入群組"]', 'div[aria-label="加入"]', 'span:has-text("加入群組")']) {
      joinBtns = await page.$$(sel);
      if (joinBtns.length > 0) {
        console.log(`  📦 ${joinBtns.length} 個加入按鈕`);
        break;
      }
    }
    
    console.log(`  👥 ${groupUrls.length} 個群組`);
    totalFound += groupUrls.length;
    
    // Join first few
    let joinedThis = 0;
    for (let i = 0; i < Math.min(3, joinBtns.length); i++) {
      try {
        await joinBtns[i].scrollIntoViewIfNeeded();
        await joinBtns[i].click();
        await page.waitForTimeout(2000);
        
        const txt = await joinBtns[i].innerText().catch(() => '?');
        if (txt.includes('已') || txt.includes('待')) {
          joinedCount++;
          joinedThis++;
          joinedGroups.push(groupUrls[i]);
        }
      } catch (e) {}
      await page.waitForTimeout(800);
    }
    
    console.log(`  ✅ +${joinedThis} (累計 ${joinedCount})`);
    
    if (joinedCount >= 50) break;
    await page.waitForTimeout(1500);
  }
  
  console.log(`\n\n🎉 完成！加入 ${joinedCount} 個群組`);
  
  // Save results
  fs.writeFileSync('./hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    joined: joinedCount,
    groups: joinedGroups
  }, null, 2));
  
  await page.screenshot({ path: '/tmp/fb_done.png', fullPage: true });
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
