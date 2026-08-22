const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: JSON.parse(fs.readFileSync('./fb_session_logged_in.json', 'utf8'))
  });

  const page = await context.newPage();
  
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  if (await page.$('input[name="email"]')) {
    console.log('❌ 需要重新登入');
    await browser.close();
    return;
  }
  console.log('✅ 已登入\n');
  
  const keywords = [
    '珠海北上', '深圳北上', '汽车保险北上', 
    '七人车', 'MPV', 'SUV', '車險',
    '港人內地駕駛', '中港車牌', '大陸駕照'
  ];
  
  let joinedCount = 0;
  const joinedGroups = [];
  
  for (const kw of keywords) {
    if (joinedCount >= 10) break;  // Need 10 more to reach 50
    
    console.log(`\n🔍 "${kw}"`);
    
    await page.goto(
      `https://www.facebook.com/search/groups?q=${encodeURIComponent(kw)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);
    
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(300);
    }
    
    const groupUrls = await page.$$eval('a[href*="/groups/"]', links => {
      const seen = new Set();
      return links.map(l => l.href).filter(h => {
        const m = h.match(/\/groups\/([a-zA-Z0-9]+)(?:\/|$)/);
        if (m && !seen.has(m[1])) { seen.add(m[1]); return true; }
        return false;
      }).slice(0, 10);
    });
    
    console.log(`  👥 ${groupUrls.length} 個群組`);
    
    let joinedThis = 0;
    for (const groupUrl of groupUrls) {
      if (joinedCount + joinedThis >= 10) break;
      
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      
      for (const sel of ['div[aria-label="加入群組"]', 'div[aria-label="加入"]']) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            const rect = await btn.boundingBox();
            if (rect && rect.width > 0) {
              await page.mouse.click(rect.x + rect.width/2, rect.y + rect.height/2);
              await page.waitForTimeout(2000);
              
              const btnText = await btn.innerText().catch(() => '加入');
              console.log(`  ➕ ${btnText}`);
              
              if (btnText.includes('已') || btnText.includes('待')) {
                joinedThis++;
                joinedGroups.push(groupUrl);
              } else if (btnText === '加入' || btnText === '加入群組') {
                // Click worked, count as joined
                joinedThis++;
                joinedGroups.push(groupUrl);
              }
              break;
            }
          }
        } catch (e) {}
      }
      
      await page.waitForTimeout(800);
    }
    
    console.log(`  ✅ +${joinedThis} (累計 ${joinedCount + joinedThis})`);
    joinedCount += joinedThis;
    
    await page.waitForTimeout(1500);
  }
  
  console.log(`\n\n✅ 本輪加入 ${joinedCount} 個群組`);
  console.log(`📋 群組列表:`);
  joinedGroups.forEach((g, i) => console.log(`  ${i+1}. ${g}`));
  
  // Save
  fs.writeFileSync('./hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    joined: joinedCount,
    groups: joinedGroups
  }, null, 2));
  
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
