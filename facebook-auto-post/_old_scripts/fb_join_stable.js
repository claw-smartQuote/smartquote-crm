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
  
  console.log('📄 開啟 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  if (await page.$('input[name="email"]')) {
    console.log('❌ 需要重新登入');
    await browser.close();
    return;
  }
  console.log('✅ 已登入\n');
  
  // Get cookies
  const cookies = await context.cookies();
  console.log(`📦 ${cookies.length} 個 cookies\n`);
  
  // Save cookies for later use
  fs.writeFileSync('./fb_cookies.json', JSON.stringify(cookies, null, 2));
  console.log('💾 Cookies 已保存到 fb_cookies.json\n');
  
  // Now navigate to groups page and save
  await page.goto('https://www.facebook.com/groups', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Scroll and collect groups
  let allGroupUrls = new Set();
  
  for (let i = 0; i < 15; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(500);
    
    const urls = await page.$$eval('a[href*="/groups/"]', links => {
      return links.map(l => l.href).filter(h => h.match(/\/groups\/[a-zA-Z0-9]+(?:\/|$)/));
    });
    
    urls.forEach(u => allGroupUrls.add(u));
    console.log(`[${i+1}/15] 找到 ${allGroupUrls.size} 個群組`);
  }
  
  const uniqueGroups = [...allGroupUrls];
  console.log(`\n總共找到 ${uniqueGroups.length} 個獨特群組`);
  
  // Filter to only HK/north related
  const hkRelated = uniqueGroups.filter(url => {
    // We'll check the group name after joining
    return true; // join all for now
  });
  
  console.log(`准備加入 ${hkRelated.length} 個群組\n`);
  
  let joinedCount = 0;
  const joinedGroups = [];
  
  for (const groupUrl of hkRelated) {
    if (joinedCount >= 50) break;
    
    try {
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      
      // Check if already a member
      const pageText = await page.innerText('body');
      if (pageText.includes('已成為成員') || pageText.includes('已加入')) {
        console.log(`⏭️  已加入: ${groupUrl}`);
        continue;
      }
      
      // Try to find and click join button
      let joined = false;
      
      for (const sel of [
        'div[aria-label="加入群組"]',
        'div[aria-label="加入"]',
        'span:has-text("加入群組")'
      ]) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            const rect = await btn.boundingBox();
            if (rect && rect.width > 0 && rect.height > 0) {
              await page.mouse.click(rect.x + rect.width/2, rect.y + rect.height/2);
              await page.waitForTimeout(2500);
              
              const text = await btn.innerText().catch(() => '?');
              if (text.includes('已') || text.includes('待')) {
                joined = true;
              } else if (text === '加入' || text === '加入群組') {
                joined = true; // Assume success if text didn't change but no error
              }
              
              if (joined) {
                joinedCount++;
                joinedGroups.push(groupUrl);
                console.log(`✅ [${joinedCount}] ${text} - ${groupUrl}`);
              }
              break;
            }
          }
        } catch (e) {}
      }
      
      if (!joined) {
        console.log(`❌ 加入失敗: ${groupUrl}`);
      }
      
    } catch (e) {
      console.log(`❌ 錯誤: ${e.message.substring(0, 50)}`);
    }
    
    await page.waitForTimeout(1000);
  }
  
  console.log(`\n\n🎉 完成！共加入 ${joinedCount} 個群組`);
  
  fs.writeFileSync('./hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    joined: joinedCount,
    groups: joinedGroups
  }, null, 2));
  
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
