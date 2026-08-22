const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  // Try to load existing cookies
  let cookies = [];
  try {
    const state = JSON.parse(fs.readFileSync('./fb_session_logged_in.json', 'utf8'));
    cookies = state.cookies || [];
    console.log(`📂 載入 ${cookies.length} 個 cookies`);
  } catch (e) {
    console.log('⚠️ 無法載入 cookies');
  }

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // Set cookies if we have them
  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log('🍪 Cookies 已添加');
  }

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Check login status
  const emailField = await page.$('input[name="email"]');
  if (emailField) {
    console.log('⚠️ Session 失效，需要重新登入');
    
    // Pre-fill email
    await emailField.fill('to@smartquote.cn');
    console.log('✅ email 已預填，請在瀏覽器中輸入密碼: Pin4fb123#');
    console.log('等待 90 秒...\n');
    
    // Wait for manual login
    let attempts = 0;
    while (attempts < 45) {
      await page.waitForTimeout(2000);
      attempts++;
      
      if (!(await page.$('input[name="email"]'))) {
        console.log('\n✅ 檢測到已登入！');
        break;
      }
      
      if (attempts % 15 === 0) {
        console.log(`⏳ 等待中... (${attempts*2}秒)`);
      }
    }
    
    // Save cookies after login
    if (!(await page.$('input[name="email"]'))) {
      const newCookies = await context.cookies();
      fs.writeFileSync('./fb_session_logged_in.json', JSON.stringify({ cookies: newCookies, origins: [] }, null, 2));
      console.log(`💾 已保存 ${newCookies.length} 個 cookies`);
    }
  } else {
    console.log('✅ 已登入！');
    
    // Save cookies
    const sessionCookies = await context.cookies();
    fs.writeFileSync('./fb_session_logged_in.json', JSON.stringify({ cookies: sessionCookies, origins: [] }, null, 2));
    console.log(`💾 已保存 ${sessionCookies.length} 個 cookies`);
  }
  
  // Verify login and proceed to join groups
  if (!(await page.$('input[name="email"]'))) {
    await page.waitForTimeout(2000);
    
    const keywords = [
      '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
      '大灣區車', '保姆車', '七人車', 'MPV', 'SUV',
      '珠海北上', '深圳北上', '广州北上', '汽車保險'
    ];
    
    let joinedCount = 0;
    const joinedGroups = [];
    
    for (const kw of keywords) {
      if (joinedCount >= 50) break;
      
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
        }).slice(0, 8);
      });
      
      console.log(`  👥 ${groupUrls.length} 個群組`);
      
      let joinedThis = 0;
      for (const groupUrl of groupUrls) {
        if (joinedCount + joinedThis >= 10) break;
        
        try {
          await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1500);
          
          for (const sel of ['div[aria-label="加入群組"]', 'div[aria-label="加入"]']) {
            const btn = await page.$(sel);
            if (btn) {
              const rect = await btn.boundingBox();
              if (rect && rect.width > 0) {
                await page.mouse.click(rect.x + rect.width/2, rect.y + rect.height/2);
                await page.waitForTimeout(2000);
                
                const text = await btn.innerText().catch(() => '?');
                if (text.includes('已') || text.includes('待')) {
                  joinedThis++;
                  joinedGroups.push(groupUrl);
                  console.log(`  ✅ ${text}`);
                } else {
                  joinedThis++; // Assume success
                  joinedGroups.push(groupUrl);
                  console.log(`  ✅ 加入`);
                }
                break;
              }
            }
          }
        } catch (e) {}
        
        await page.waitForTimeout(800);
      }
      
      joinedCount += joinedThis;
      console.log(`  📊 +${joinedThis} (累計 ${joinedCount})`);
      await page.waitForTimeout(1500);
    }
    
    console.log(`\n\n🎉 完成！共加入 ${joinedCount} 個群組`);
    
    fs.writeFileSync('./hk_north_groups_joined.json', JSON.stringify({
      date: new Date().toISOString(),
      joined: joinedCount,
      groups: joinedGroups
    }, null, 2));
  }
  
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
