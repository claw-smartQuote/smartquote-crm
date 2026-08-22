const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  await page.goto('https://www.facebook.com/groups/414054913244649/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 點擊「寫點內容」
  const writeBtn = await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const s of spans) {
      if (s.textContent.includes('寫點內容') && s.offsetParent !== null) {
        s.click();
        return s.textContent;
      }
    }
    return null;
  });
  
  if (!writeBtn) {
    console.log('找不到寫點內容');
    await browser.close();
    return;
  }
  
  console.log('找到:', writeBtn);
  await page.waitForTimeout(3000);
  
  // 嘗試用 setInputFiles 上傳圖片
  const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg';
  
  const fileInputs = await page.$$('input[type="file"]');
  console.log('找到 file input 數:', fileInputs.length);
  
  for (let i = 0; i < fileInputs.length; i++) {
    try {
      const accept = await fileInputs[i].evaluate(el => el.accept || 'none');
      console.log(`  input[${i}] accept: ${accept}`);
      await fileInputs[i].setInputFiles(image);
      console.log(`  ✅ input[${i}] 圖片已附加`);
      break;
    } catch (e) {
      console.log(`  ❌ input[${i}] 失敗: ${e.message.substring(0, 80)}`);
    }
  }
  
  await page.waitForTimeout(5000);
  
  // 截圖檢查
  await page.screenshot({ path: '/tmp/fb_upload_test.png', fullPage: false });
  console.log('截圖已保存');
  
  await browser.close();
})();
