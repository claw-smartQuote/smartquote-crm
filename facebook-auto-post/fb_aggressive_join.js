const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  
  // Load session
  console.log('📂 載入 session...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Check if logged in
  if (await page.$('input[name="email"]')) {
    console.log('❌ 需要重新登入');
    await browser.close();
    return;
  }
  console.log('✅ 已登入\n');
  
  const keywords = [
    '港車北上 群組', '港車 北上', '兩地牌 汽車', '中港車 群組', 
    '粵港車', '跨境車 北上', '大灣區 車', '保姆車 北上',
    '七人車 北上', 'MPV 跨境', 'SUV 北上 車', '珠海 北上',
    '深圳 北上', '广州 北上', '內地自駕', '港人 內地駕駛',
    '中港 車牌', '大陸 駕照', '車險 北上', '汽車保險 北上'
  ];
  
  let joinedCount = 0;
  let totalFound = 0;
  const joinedGroups = [];
  
  for (const kw of keywords) {
    console.log(`\n🔍 搜索: "${kw}"`);
    
    await page.goto(
      `https://www.facebook.com/search/groups?q=${encodeURIComponent(kw)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    
    // AGGRESSIVE scrolling to load results
    await page.waitForTimeout(2000);
    
    // Scroll up first to reset position
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    
    // Scroll down in steps, waiting for lazy load
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(800);
    }
    
    // Check for "See More" buttons and click them
    let seeMoreClicked = true;
    while (seeMoreClicked) {
      seeMoreClicked = false;
      const seeMoreBtns = await page.$$('span:has-text("查看更多")');
      for (const btn of seeMoreBtns) {
        try {
          await btn.click();
          await page.waitForTimeout(1000);
          seeMoreClicked = true;
        } catch (e) {}
      }
    }
    
    // Scroll more after seeing more
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(500);
    }
    
    // Count all visible join buttons
    let joinBtns = [];
    
    // Try all possible selectors
    const selectors = [
      'div[aria-label="加入群組"]',
      'div[aria-label="加入"]',
      'div[role="button"][tabindex="0"]',
      'span:has-text("加入群組")',
      'div:has-text("加入群組")'
    ];
    
    for (const sel of selectors) {
      joinBtns = await page.$$(sel);
      if (joinBtns.length > 0) {
        console.log(`  📦 找到 ${joinBtns.length} 個 (${sel.substring(0, 30)})`);
        break;
      }
    }
    
    // Get unique group links
    const groupUrls = await page.$$eval('a[href*="/groups/"]', links => {
      const seen = new Set();
      return links
        .map(l => l.href)
        .filter(h => {
          // Match group URLs like /groups/abc123
          const match = h.match(/\/groups\/([a-zA-Z0-9]+)(?:\/|$)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            return true;
          }
          return false;
        })
        .slice(0, 15);
    });
    
    totalFound += groupUrls.length;
    console.log(`  👥 發現 ${groupUrls.length} 個群組`);
    
    // Join first 3 groups that have join buttons
    let joinedThisRound = 0;
    for (let i = 0; i < Math.min(3, Math.min(joinBtns.length, groupUrls.length)); i++) {
      try {
        const btn = joinBtns[i];
        await btn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await btn.click();
        await page.waitForTimeout(2500);
        
        const btnText = await btn.innerText().catch(() => '?');
        console.log(`  ➕ ${btnText}`);
        
        if (btnText.includes('已') || btnText.includes('待')) {
          joinedCount++;
          joinedThisRound++;
          joinedGroups.push(groupUrls[i]);
        }
      } catch (e) {
        // Button might have moved
      }
      await page.waitForTimeout(1000);
    }
    
    console.log(`  ✅ 本輪+${joinedThisRound}，累計 ${joinedCount}/${totalFound}`);
    
    if (joinedCount >= 50) {
      console.log('\n🎉 已達到目標 50 個群組！');
      break;
    }
    
    await page.waitForTimeout(2000);
  }
  
  console.log(`\n\n🎉 完成！`);
  console.log(`   總共發現: ${totalFound} 個群組`);
  console.log(`   成功加入: ${joinedCount} 個群組`);
  
  await page.screenshot({ path: '/tmp/fb_join_final.png', fullPage: true });
  console.log('📸 截圖: /tmp/fb_join_final.png');
  
  // Save joined groups list
  const fs = require('fs');
  fs.writeFileSync('./hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    totalJoined: joinedCount,
    groups: joinedGroups
  }, null, 2));
  console.log('💾 群組列表: hk_north_groups_joined.json');
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
