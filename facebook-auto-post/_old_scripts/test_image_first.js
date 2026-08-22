const { chromium } = require('playwright');
const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg';

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();
  
  // 導航
  await page.goto('https://www.facebook.com/groups/853630211463706', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  
  // Step 3: 點擊寫點內容
  const clicked = await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const s of spans) {
      if ((s.textContent.includes('寫點內容') || s.textContent.includes('Write something')) && s.offsetParent !== null) {
        s.click();
        return true;
      }
    }
    return false;
  });
  console.log('Step 3 點擊寫點內容:', clicked);
  await page.waitForTimeout(3000);
  
  // Step 5: 找輸入框
  const editorFound = await page.evaluate(() => {
    const editables = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]');
    for (const el of editables) {
      if (el.offsetParent !== null) { el.focus(); return true; }
    }
    return false;
  });
  console.log('Step 5 輸入框:', editorFound);
  
  // Step 6: 先上傳圖片
  console.log('Step 6: 點擊相片/影片按鈕...');
  const photoBtn = await page.$('[aria-label="相片／影片"]');
  if (photoBtn) {
    console.log('找到按鈕，等待 file chooser...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      photoBtn.click()
    ]);
    await fileChooser.setFiles(image);
    console.log('Step 6: ✅ 圖片已上傳');
    await page.waitForTimeout(6000);
  } else {
    console.log('Step 6: ❌ 找不到相片按鈕');
  }
  
  // Step 7: 輸入文字
  console.log('Step 7: 輸入文字...');
  const content = '🚗 測試帖文 - 圖片先上傳\nhttps://api.whatsapp.com/send?phone=85221101144';
  await page.keyboard.type(content, { delay: 30 });
  console.log('Step 7: ✅ 文字已輸入');
  
  // 截圖確認
  await page.screenshot({ path: '/tmp/fb_before_publish.png' });
  console.log('截圖已保存: /tmp/fb_before_publish.png');
  console.log('完成（未發佈，請檢查截圖）');
})();
