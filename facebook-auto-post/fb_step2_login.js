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
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Check if already logged in
  const emailInput = await page.$('input[name="email"]');
  
  if (!emailInput) {
    console.log('✅ 已經登入了！');
    console.log('🔗 當前 URL:', page.url());
    await page.screenshot({ path: '/tmp/fb_step2_already.png', fullPage: false });
  } else {
    console.log('🔐 找到登入框，填寫憑證...');
    
    // Fill email
    await page.fill('input[name="email"]', 'to@smartquote.cn');
    await page.waitForTimeout(300);
    
    // Fill password
    await page.fill('input[name="pass"]', 'Apple123#');
    await page.waitForTimeout(300);
    
    // Take screenshot before login
    await page.screenshot({ path: '/tmp/fb_step2_before_login.png', fullPage: false });
    console.log('📸 登入前截圖: /tmp/fb_step2_before_login.png');
    
    // Click login button
    console.log('📤 點擊登入按鈕...');
    
    // Try multiple selectors for login button
    const loginBtn = await page.$('button[type="submit"]');
    if (loginBtn) {
      await loginBtn.click();
    } else {
      // Try pressing Enter
      await page.keyboard.press('Enter');
    }
    
    // Wait for navigation - IMPORTANT: wait for URL to change
    console.log('⏳ 等待登入完成...');
    await page.waitForTimeout(8000);
    
    // Check URL
    const currentUrl = page.url();
    console.log('🔗 提交後 URL:', currentUrl);
    
    // Take screenshot after login
    await page.screenshot({ path: '/tmp/fb_step2_after_login.png', fullPage: false });
    console.log('📸 登入後截圖: /tmp/fb_step2_after_login.png');
    
    // Check if 2FA or verification is needed
    if (currentUrl.includes('two_step_verification') || 
        currentUrl.includes('checkpoint') ||
        currentUrl.includes('approval')) {
      console.log('\n⚠️  需要 2FA 驗證！');
      console.log('請在你的手機上批准這個登入請求');
      console.log('等待 60 秒讓你完成驗證...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Check URL again after 2FA
      console.log('🔗 驗證後 URL:', page.url());
      await page.screenshot({ path: '/tmp/fb_step2_after_2fa.png', fullPage: false });
    }
    
    // Wait a bit more for cookies to settle
    await page.waitForTimeout(3000);
    
    // Check if we're now logged in
    const emailInputAfter = await page.$('input[name="email"]');
    console.log('✅ 登入成功:', !emailInputAfter);
    
    // Take final screenshot
    await page.screenshot({ path: '/tmp/fb_step2_final.png', fullPage: false });
    console.log('📸 最终状态截圖: /tmp/fb_step2_final.png');
  }
  
  // NOW save the storage state (after login is complete)
  console.log('\n💾 保存 session state...');
  await context.storageState({ path: './fb_session_logged_in.json' });
  console.log('✅ Session 已保存到 fb_session_logged_in.json');
  
  console.log('\n✅ 第二步完成！');
  console.log('現在可以運行 step3 來搜索和加入群組');
  
  console.log('\n⏸️  等待 20 秒...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  await browser.close();
  console.log('👋 瀏覽器已關閉');
})();
