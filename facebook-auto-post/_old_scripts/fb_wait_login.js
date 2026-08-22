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
  
  console.log('📄 打開 Facebook 登入頁面...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Pre-fill the email field if it exists
  try {
    const emailInput = await page.$('input[name="email"]');
    if (emailInput) {
      await emailInput.fill('to@smartquote.cn');
      console.log('✅ 已預填 email');
    }
  } catch (e) {}
  
  console.log('\n⏳ 等待你完成登入和2FA...');
  console.log('   → 請在瀏覽器中輸入密碼: Apple123#');
  console.log('   → 如果需要2FA，在手機上批准\n');
  
  // Continuously check for login success
  let lastUrl = page.url();
  let stableCount = 0;
  
  while (true) {
    try {
      await page.waitForTimeout(2000);
      
      const currentUrl = page.url();
      
      // Detect login success: no email input AND not on login page
      const emailInput = await page.$('input[name="email"]');
      const isLoggedIn = !emailInput && !currentUrl.includes('/login');
      const is2FA = currentUrl.includes('two_step_verification');
      
      // Only log changes
      if (currentUrl !== lastUrl) {
        console.log(`🔗 URL: ${currentUrl.substring(0, 80)}`);
        lastUrl = currentUrl;
        stableCount = 0;
      }
      
      if (is2FA) {
        stableCount++;
        if (stableCount % 10 === 0) {
          console.log('⏳ 等待2FA批准...');
        }
      }
      
      if (isLoggedIn) {
        console.log('\n✅ 檢測到登入成功！');
        await page.screenshot({ path: '/tmp/fb_logged_in.png', fullPage: false });
        
        // Wait for page to fully load
        await page.waitForTimeout(3000);
        
        // Save session
        console.log('💾 保存 session state...');
        await context.storageState({ path: './fb_session_logged_in.json' });
        
        // Verify
        const cookies = await context.cookies();
        console.log(`✅ 已保存 ${cookies.length} 個 cookies`);
        console.log('💾 Session 路徑: fb_session_logged_in.json');
        
        console.log('\n✅ 完成！你可以關閉瀏覽器了');
        console.log('告訴我，我繼續搜索加入群組');
        
        await page.waitForTimeout(5000);
        await browser.close();
        return;
      }
      
    } catch (e) {
      // Page might be navigating, wait and retry
      await page.waitForTimeout(2000);
    }
  }
})();
