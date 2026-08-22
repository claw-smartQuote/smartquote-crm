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

  const page = await context.newPage();
  
  // Load saved session from step 2
  console.log('📂 載入登入後的 session state...');
  try {
    await context.storageState({ path: './fb_step2_state.json' });
    console.log('✅ Session loaded');
  } catch (e) {
    console.log('⚠️  無法載入 session state:', e.message);
  }
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  console.log('🔗 當前 URL:', page.url());
  
  // Take screenshot to confirm logged in
  await page.screenshot({ path: '/tmp/fb_step3_home.png', fullPage: false });
  console.log('📸 首頁截圖: /tmp/fb_step3_home.png');
  
  // Check if we're logged in
  const isLoggedIn = !await page.$('input[name="email"]');
  console.log('✅ 已登入:', isLoggedIn);
  
  if (!isLoggedIn) {
    console.log('❌ 未登入，請先運行 step2');
    await browser.close();
    return;
  }
  
  // Navigate to groups
  console.log('📱 前往群組頁面...');
  await page.goto('https://www.facebook.com/groups', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/fb_step3_groups.png', fullPage: false });
  console.log('📸 群組頁面截圖: /tmp/fb_step3_groups.png');
  
  // Search for HK Northward groups
  const searchKeywords = [
    '港車北上',
    '港車 北上',
    '兩地牌',
    '中港車',
    '跨境車',
    '大灣區 車'
  ];
  
  console.log('\n🔍 開始搜索群組...');
  
  for (const keyword of searchKeywords) {
    console.log(`\n--- 搜索關鍵詞: "${keyword}" ---`);
    
    // Go to search page
    const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for results to load
    await page.waitForTimeout(3000);
    
    // Scroll down to load more results
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(1000);
    }
    
    await page.screenshot({ path: `/tmp/fb_search_${keyword}.png`, fullPage: true });
    
    // Find group join buttons
    const joinButtons = await page.$$('div[aria-label="加入群組"]');
    console.log(`找到 ${joinButtons.length} 個可加入的群組`);
    
    // Also try alternative selectors
    const altJoinButtons = await page.$$('span:has-text("加入")');
    console.log(`(alt) 找到 ${altJoinButtons.length} 個加入按鈕`);
    
    // Get group names
    const groupNames = await page.$$eval('div[aria-label="加入群組"]', 
      buttons => buttons.map(b => {
        // Try to find group name nearby
        const parent = b.closest('div');
        return parent ? parent.innerText.substring(0, 50) : 'unknown';
      })
    );
    
    console.log('找到的群組:', groupNames.slice(0, 5));
    
    // Wait between searches
    await page.waitForTimeout(2000);
  }
  
  console.log('\n✅ 搜索完成！');
  console.log('📸 截圖已保存到 /tmp/fb_search_*.png');
  
  // Save final state
  await context.storageState({ path: './fb_step3_state.json' });
  
  console.log('\n⏸️  等待 60 秒讓你查看結果...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  await browser.close();
  console.log('👋 完成！');
})();
