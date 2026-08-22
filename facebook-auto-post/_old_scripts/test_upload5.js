const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  await page.goto('https://www.facebook.com/groups/414054913244649/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 點擊「寫點內容」
  const writeSpan = page.locator('span:has-text("寫點內容")').first();
  await writeSpan.click();
  await page.waitForTimeout(3000);
  console.log('[1] 已打開建立帖子');
  
  // 在模態框中找到「相片／影片」按鈕
  const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg';
  
  // 找到新增到帖子的附件按鈕
  const photoBtn = page.locator('[role="dialog"] [aria-label*="相片"], [role="dialog"] [aria-label*="影片"], [role="dialog"] [aria-label*="Photo"]').first();
  const btnExists = await photoBtn.count();
  console.log('[2] 相片按鈕存在:', btnExists > 0);
  
  if (btnExists > 0) {
    // 先設置 filechooser 監聽，再用 Playwright 原生 click
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      photoBtn.click()
    ]);
    
    console.log('[3] filechooser 觸發');
    await fileChooser.setFiles(image);
    console.log('[4] ✅ 圖片已附加');
  } else {
    // 備用：找所有 role=button 的元素
    const btns = page.locator('[role="dialog"] [role="button"]');
    const count = await btns.count();
    console.log('[2b] 按鈕數:', count);
    
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent();
      if (text.includes('相片') || text.includes('影片') || text.includes('Photo')) {
        console.log('[2c] 找到:', text);
        
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          btns.nth(i).click()
        ]);
        
        console.log('[3] filechooser 觸發');
        await fileChooser.setFiles(image);
        console.log('[4] ✅ 圖片已附加');
        break;
      }
    }
  }
  
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  await page.screenshot({ path: '/tmp/fb_final_check2.png', fullPage: false });
  console.log('[5] 截圖已保存');
  
  await browser.close();
})();
