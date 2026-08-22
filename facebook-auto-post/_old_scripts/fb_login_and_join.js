const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Pre-fill email
  try {
    await page.fill('input[name="email"]', 'to@smartquote.cn');
    console.log('✅ email 已預填');
  } catch (e) {}
  
  console.log('\n👤 請完成登入 (密碼: Pin4fb123#)，我會自動檢測...\n');
  
  // Wait for login
  let stableCount = 0;
  let lastUrl = page.url();
  
  while (true) {
    await page.waitForTimeout(2000);
    
    try {
      const url = page.url();
      
      if (url !== lastUrl) {
        console.log(`🔗 ${url.substring(0, 80)}`);
        lastUrl = url;
        stableCount = 0;
      }
      
      // Check if logged in
      const emailField = await page.$('input[name="email"]');
      
      if (!emailField && !url.includes('/login') && !url.includes('two_step')) {
        console.log('\n✅ 檢測到已登入！');
        await page.screenshot({ path: '/tmp/fb_logged_in.png' });
        
        // Wait for page to fully settle
        await page.waitForTimeout(5000);
        
        // Get cookies BEFORE closing
        const cookies = await context.cookies();
        console.log(`📦 獲取到 ${cookies.length} 個 cookies`);
        
        // Save storage state manually
        const storageState = {
          cookies: cookies,
          origins: [{
            origin: 'https://www.facebook.com',
            localStorage: []
          }]
        };
        
        const fs = require('fs');
        fs.writeFileSync('./fb_session_logged_in.json', JSON.stringify(storageState, null, 2));
        console.log('💾 Session 已保存 (含 cookies)');
        
        // Verify
        console.log('\n🔍 驗證 session...');
        await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        
        const stillLoggedIn = !(await page.$('input[name="email"]'));
        console.log(`✅ Session 驗證: ${stillLoggedIn ? '成功' : '失敗'}`);
        
        if (stillLoggedIn) {
          await page.screenshot({ path: '/tmp/fb_session_ok.png' });
          
          // NOW start searching for groups
          console.log('\n🔍 開始搜索港車北上群組...\n');
          
          const keywords = [
            '港車北上', '港車 北上', '兩地牌', '中港車', 
            '粵港車', '跨境車', '大灣區車主', '保姆車北上'
          ];
          
          let totalGroups = 0;
          let joinedCount = 0;
          
          for (const kw of keywords) {
            console.log(`\n--- 搜索: "${kw}" ---`);
            
            await page.goto(
              `https://www.facebook.com/search/groups?q=${encodeURIComponent(kw)}`,
              { waitUntil: 'domcontentloaded', timeout: 30000 }
            );
            await page.waitForTimeout(3000);
            
            // Scroll to load results
            for (let i = 0; i < 5; i++) {
              await page.mouse.wheel(0, 400);
              await page.waitForTimeout(600);
            }
            
            await page.screenshot({ path: `/tmp/fb_kw_${kw}.png` });
            
            // Find join buttons - try multiple selectors
            let joinBtns = [];
            const selectors = [
              'div[aria-label="加入群組"]',
              'div[aria-label="加入"]',
              'span:has-text("加入群組")'
            ];
            
            for (const sel of selectors) {
              joinBtns = await page.$$(sel);
              if (joinBtns.length > 0) {
                console.log(`  找到 ${joinBtns.length} 個加入按鈕`);
                break;
              }
            }
            
            // Get group names
            const groupEls = await page.$$eval('a[href*="/groups/"]', els => 
              els.map(el => ({ href: el.href, name: el.innerText.substring(0, 40) }))
                .filter(g => g.href.match(/\/groups\/[^\/]+$/) && g.name.trim())
                .slice(0, 8)
            );
            
            console.log(`  發現 ${groupEls.length} 個群組`);
            
            // Join up to 3 from each keyword
            let joinedThisRound = 0;
            for (let i = 0; i < Math.min(3, joinBtns.length); i++) {
              try {
                const btn = joinBtns[i];
                await btn.scrollIntoViewIfNeeded();
                await btn.click();
                await page.waitForTimeout(2000);
                
                const btnText = await btn.innerText().catch(() => '?');
                console.log(`  按鈕: "${btnText}"`);
                
                if (btnText.includes('已') || btnText.includes('加入')) {
                  joinedCount++;
                  joinedThisRound++;
                }
              } catch (e) {}
              await page.waitForTimeout(1000);
            }
            
            totalGroups += groupEls.length;
            console.log(`  本輪加入: ${joinedThisRound}，累計: ${joinedCount}`);
            
            await page.waitForTimeout(2000);
          }
          
          console.log(`\n✅ 完成！共發現 ${totalGroups} 個群組，成功加入 ${joinedCount} 個`);
          await page.screenshot({ path: '/tmp/fb_final.png' });
          
        }
        
        await new Promise(r => setTimeout(r, 5000));
        await browser.close();
        return;
        
      } else if (url.includes('two_step')) {
        const sc = Math.floor(stableCount / 5);
        if (sc % 10 === 0) console.log('⏳ 等待2FA批准...');
        stableCount++;
      }
      
    } catch (e) {
      // Page navigating, wait
    }
  }
})();
