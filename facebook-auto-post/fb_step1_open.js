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
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait a bit for any JS to execute
  await page.waitForTimeout(3000);
  
  // Take screenshot to see current state
  await page.screenshot({ path: '/tmp/fb_step1_initial.png', fullPage: false });
  console.log('📸 截圖已保存到 /tmp/fb_step1_initial.png');
  
  // Get current URL
  console.log('🔗 當前 URL:', page.url());
  
  // Get page title
  console.log('📝 頁面標題:', await page.title());
  
  // Check if we see login form
  const emailInput = await page.$('input[name="email"]');
  const passInput = await page.$('input[name="pass"]');
  const loginBtn = await page.$('button[name="login"]');
  
  console.log('📧 找到 email 输入框:', !!emailInput);
  console.log('🔐 找到 password 输入框:', !!passInput);
  console.log('🔘 找到 login 按鈕:', !!loginBtn);
  
  // Get body content preview
  const bodyText = await page.$eval('body', el => el.innerText.substring(0, 500));
  console.log('📄 頁面內容預覽:', bodyText.substring(0, 300));
  
  // Save context for next step
  await context.storageState({ path: './fb_step1_state.json' });
  console.log('💾 Session state 已保存到 fb_step1_state.json');
  
  console.log('\n✅ 第一步完成！查看截圖 /tmp/fb_step1_initial.png');
  console.log('按 Enter 鍵結束...');
  
  // Wait for user to check
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  await browser.close();
})();
