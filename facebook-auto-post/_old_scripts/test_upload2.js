const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  await page.goto('https://www.facebook.com/groups/414054913244649/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 點擊「寫點內容」
  await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const s of spans) {
      if (s.textContent.includes('寫點內容') && s.offsetParent !== null) {
        s.click();
        return;
      }
    }
  });
  await page.waitForTimeout(3000);
  console.log('[1] 已打開建立帖子');
  
  // 點擊「相片／影片」按鈕 + 等待 filechooser
  const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg';
  let uploaded = false;
  
  try {
    // 找到「附加相片或影片」按鈕
    const photoBtn = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if ((s.textContent.includes('相片') || s.textContent.includes('影片') || s.textContent.includes('Photo')) && s.offsetParent !== null) {
          // 找到父級可點擊元素
          const btn = s.closest('[role="button"]') || s.closest('div[tabindex]') || s;
          btn.click();
          return s.textContent;
        }
      }
      return null;
    });
    
    console.log('[2] 點擊:', photoBtn);
    
    if (photoBtn) {
      // 等待 filechooser 事件
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
      ]);
      
      console.log('[3] filechooser 事件觸發');
      await fileChooser.setFiles(image);
      uploaded = true;
      console.log('[4] ✅ 圖片已附加');
    }
  } catch (e) {
    console.log('[4] ❌ 失敗:', e.message.substring(0, 100));
  }
  
  await page.waitForTimeout(3000);
  
  // 檢查是否有原生檔案對話框
  console.log('[5] 等待檢查...');
  await page.waitForTimeout(2000);
  
  // Escape 關閉任何殘留對話框
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // 截圖
  await page.screenshot({ path: '/tmp/fb_upload_test2.png', fullPage: false });
  console.log('[6] 截圖已保存');
  
  await browser.close();
})();
