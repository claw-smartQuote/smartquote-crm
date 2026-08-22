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
  
  // Pre-fill email
  try {
    await page.fill('input[name="email"]', 'to@smartquote.cn');
    console.log('✅ email 已預填: to@smartquote.cn');
  } catch (e) {}
  
  console.log('\n👤 請在瀏覽器中完成登入：');
  console.log('   1. 輸入密碼: Pin4fb123#');
  console.log('   2. 如果要2FA，在手機批准\n');
  
  // Poll with navigation safety
  let checkCount = 0;
  while (true) {
    await page.waitForTimeout(2000);
    checkCount++;
    
    try {
      const url = page.url();
      
      // Log every 5th check
      if (checkCount % 5 === 0) {
        console.log(`[${checkCount}] ${url.substring(0, 70)}`);
      }
      
      // Success: logged in and not on login/2fa page
      if (!url.includes('/login') && 
          !url.includes('two_step_verification') &&
          !url.includes('checkpoint')) {
        
        // Double check: no email input visible
        const emailField = await page.$('input[name="email"]');
        if (!emailField) {
          console.log('\n✅ 登入成功！');
          await page.screenshot({ path: '/tmp/fb_joined.png' });
          
          // Small delay for cookies
          await page.waitForTimeout(2000);
          
          // Save session
          const statePath = './fb_session_logged_in.json';
          await context.storageState({ path: statePath });
          
          const cookies = await context.cookies();
          console.log(`💾 已保存 ${cookies.length} 個 cookies 到 fb_session_logged_in.json`);
          console.log('\n✅ 完成！');
          
          await new Promise(r => setTimeout(r, 3000));
          await browser.close();
          return;
        }
      }
    } catch (e) {
      // Navigation happened, ignore
    }
  }
})();
