const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  await page.goto('https://www.facebook.com/groups/414054913244649/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 點擊「寫點內容」輸入框
  await page.evaluate(() => {
    // 找到包含「寫點內容」的可點擊元素
    const elements = document.querySelectorAll('[role="button"], span, div[tabindex]');
    for (const el of elements) {
      if (el.textContent.includes('寫點內容') && el.offsetParent !== null) {
        el.click();
        return 'clicked: ' + el.tagName;
      }
    }
    return null;
  });
  await page.waitForTimeout(3000);
  console.log('[1] 已點擊寫點內容');
  
  // 截圖看看模態框是否打開
  await page.screenshot({ path: '/tmp/fb_modal_check.png', fullPage: false });
  
  // 檢查是否有模態框
  const hasModal = await page.evaluate(() => {
    return document.querySelector('[role="dialog"]') !== null;
  });
  console.log('[2] 模態框:', hasModal);
  
  if (hasModal) {
    // 找到「相片／影片」按鈕並點擊
    const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg';
    
    // 設置 filechooser 監聽
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
    
    // 點擊「相片／影片」
    await page.evaluate(() => {
      const spans = document.querySelectorAll('[role="dialog"] span');
      for (const s of spans) {
        if (s.textContent.includes('相片') || s.textContent.includes('影片') || s.textContent.includes('Photo')) {
          const btn = s.closest('[role="button"]') || s;
          btn.click();
          return 'clicked: ' + s.textContent;
        }
      }
      return null;
    });
    
    try {
      const fileChooser = await fileChooserPromise;
      console.log('[3] filechooser 觸發');
      await fileChooser.setFiles(image);
      console.log('[4] ✅ 圖片已附加');
    } catch (e) {
      console.log('[4] ❌ filechooser 失敗:', e.message.substring(0, 80));
    }
  }
  
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  await page.screenshot({ path: '/tmp/fb_final_check.png', fullPage: false });
  console.log('[5] 截圖已保存');
  
  await browser.close();
})();
