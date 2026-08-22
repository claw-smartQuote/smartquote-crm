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
  
  console.log('📸 截圖已保存: /tmp/fb_manual_login.png');
  await page.screenshot({ path: '/tmp/fb_manual_login.png', fullPage: false });
  
  console.log('\n⏳ 等待你手動完成登入和2FA...');
  console.log('   1. 在瀏覽器中輸入 email: to@smartquote.cn');
  console.log('   2. 輸入密碼: Apple123#');
  console.log('   3. 如果需要2FA，在手機上批准');
  console.log('   4. 我會自動檢測登入成功並保存 session\n');
  
  // Poll every 3 seconds to check if logged in
  let attempts = 0;
  const maxAttempts = 60; // 3 minutes max
  
  while (attempts < maxAttempts) {
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    const emailInput = await page.$('input[name="email"]');
    
    console.log(`[${attempts + 1}] URL: ${currentUrl.substring(0, 60)}...`);
    
    // Check if logged in (no email input found)
    if (!emailInput && !currentUrl.includes('login')) {
      console.log('\n✅ 檢測到登入成功！');
      
      // Take screenshot to confirm
      await page.screenshot({ path: '/tmp/fb_logged_in_confirmed.png', fullPage: false });
      console.log('📸 登入確認截圖: /tmp/fb_logged_in_confirmed.png');
      
      // Wait a bit more for cookies to settle
      await page.waitForTimeout(3000);
      
      // Save the session state
      console.log('\n💾 保存 session state...');
      await context.storageState({ path: './fb_session_logged_in.json' });
      console.log('✅ Session 已保存到 fb_session_logged_in.json');
      
      // Verify by loading it back
      const savedContext = await browser.newContext();
      await savedContext.storageState({ path: './fb_session_logged_in.json' });
      const cookies = await savedContext.cookies();
      console.log(`📦 保存了 ${cookies.length} 個 cookies`);
      
      await savedContext.close();
      
      console.log('\n✅ 完成！你現在可以運行腳本來搜索和加入群組了');
      
      await page.waitForTimeout(3000);
      await browser.close();
      return;
    }
    
    // Check if still on 2FA page
    if (currentUrl.includes('two_step_verification')) {
      console.log('   → 等待2FA批准中...');
    }
    
    attempts++;
  }
  
  console.log('\n⚠️  時間到了，保存當前狀態...');
  await page.screenshot({ path: '/tmp/fb_timeout.png', fullPage: false });
  
  await browser.close();
})();
