/**
 * Facebook 保存 Session v4
 * 處理已登入但 session 不完整的情況
 */

const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('🚀 啟動瀏覽器...');
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 檢查登入狀態
  const loginForm = await page.$('input[name="email"]');
  
  if (loginForm) {
    console.log('⚠️  需要登入...');
    console.log('   帳戶: 萊to@smartquote.cn');
    console.log('   密碼: Pin4fb123#');
    console.log('');
    
    let checkCount = 0;
    while (await page.$('input[name="email"]') && checkCount < 120) {
      await page.waitForTimeout(1000);
      checkCount++;
      if (checkCount % 10 === 0) console.log(`⏳ 等待登入... ${checkCount}s`);
    }
    
    if (await page.$('input[name="email"]')) {
      console.log('\n❌ 等待超時！');
      await browser.close();
      return;
    }
    console.log('✅ 登入成功！');
  } else {
    console.log('✅ 瀏覽器已登入');
  }
  
  // 訪問幾個頁面確保 cookies 完整
  console.log('📄 訪問頁面以獲取完整 cookies...');
  await page.goto('https://www.facebook.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 保存前檢查 cookies
  const cookies = await context.cookies();
  console.log(`\n💾 當前 cookies: ${cookies.length}`);
  
  const cookieNames = cookies.map(c => c.name);
  console.log('Names:', cookieNames.join(', '));
  
  if (!cookieNames.includes('c_user')) {
    console.log('\n⚠️  c_user 缺失，嘗試刷新...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }
  
  // 最終保存
  const storage = await context.storageState();
  fs.writeFileSync('./fb_session_logged_in.json', JSON.stringify(storage));
  
  console.log(`\n💾 Session 已保存`);
  console.log(`   Cookies: ${storage.cookies?.length || 0}`);
  
  // 檢查 c_user
  const finalCookies = await context.cookies();
  const hasCUser = finalCookies.some(c => c.name === 'c_user');
  console.log(`   c_user: ${hasCUser ? '✅' : '❌'}`);
  
  if (hasCUser) {
    const cUser = finalCookies.find(c => c.name === 'c_user');
    console.log(`   c_user value: ${cUser.value}`);
  }
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
  console.log('\n✅ 完成！');
})();
