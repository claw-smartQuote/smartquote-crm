const { chromium } = require('playwright');

(async () => {
  console.log('🚀 啟動瀏覽器...');
  
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

  // Load the saved session
  console.log('📂 載入登入 session...');
  await context.storageState({ path: './fb_session_logged_in.json' });
  
  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const url = page.url();
  console.log('🔗 當前 URL:', url);
  
  // Check if logged in
  const emailInput = await page.$('input[name="email"]');
  if (emailInput) {
    console.log('❌ Session 失效，需要重新登入');
    await browser.close();
    return;
  }
  console.log('✅ 已登入！');
  
  await page.screenshot({ path: '/tmp/fb_search_home.png' });
  
  // Keywords to search
  const keywords = [
    '港車北上',
    '港車 北上',
    '兩地牌 汽車',
    '中港車',
    '粵港車',
    '跨境車 北上',
    '大灣區 車主',
    '保姆車 北上',
    '七人車 北上'
  ];
  
  let totalJoined = 0;
  const joinedGroups = [];
  
  for (const keyword of keywords) {
    console.log(`\n🔍 搜索: "${keyword}"`);
    
    const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Scroll down to load more results
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(500);
    }
    
    // Find join buttons
    // Facebook uses different labels: "加入群組", "加入", "加入小組"
    const joinSelectors = [
      'div[aria-label="加入群組"]',
      'div[aria-label="加入"]',
      'span:has-text("加入群組")',
      'span:has-text("加入")'
    ];
    
    let joinButtons = [];
    for (const selector of joinSelectors) {
      try {
        const buttons = await page.$$(selector);
        if (buttons.length > 0) {
          console.log(`  找到 ${buttons.length} 個按鈕 (${selector})`);
          joinButtons = buttons;
          break;
        }
      } catch (e) {}
    }
    
    // Get group info
    const groupLinks = await page.$$eval('a[href*="/groups/"]', 
      links => links.map(l => ({ href: l.href, text: l.innerText.substring(0, 50) }))
        .filter(g => g.href.includes('/groups/') && !g.href.includes('search'))
        .slice(0, 10)
    );
    
    console.log(`  找到 ${groupLinks.length} 個群組`);
    
    // Try to join first few groups
    let joinedThisKeyword = 0;
    for (let i = 0; i < Math.min(5, joinButtons.length); i++) {
      try {
        const btn = joinButtons[i];
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForTimeout(2000);
        
        // Check if a dialog appeared or button changed
        const btnText = await btn.innerText();
        console.log(`  加入按鈕: "${btnText}"`);
        
        if (btnText.includes('已加入') || btnText.includes('待審核')) {
          joinedThisKeyword++;
          totalJoined++;
        }
        
        await page.waitForTimeout(1000);
      } catch (e) {
        // console.log(`  加入失敗: ${e.message.substring(0, 50)}`);
      }
    }
    
    console.log(`  本次關鍵詞加入: ${joinedThisKeyword} 個`);
    
    await page.waitForTimeout(2000);
  }
  
  console.log(`\n✅ 總共加入: ${totalJoined} 個群組`);
  
  await page.screenshot({ path: '/tmp/fb_search_done.png' });
  console.log('📸 截圖: /tmp/fb_search_done.png');
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
