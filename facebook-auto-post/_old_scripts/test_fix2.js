const { chromium } = require('playwright');

const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/02.jpeg';

function getAIText() {
  const today = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;
  const weather = ['駕駛北上，記得檢查車況，確保行車安全。'];
  const greeting = ['祝你旅途平安！'];
  return `${dateStr} ${weather[0]} ${greeting[0]}`;
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  await page.goto('https://www.facebook.com/groups/414054913244649/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('[1] 導航完成');
  
  // 點擊「寫點內容」
  const writeSpan = page.locator('span:has-text("寫點內容")').first();
  await writeSpan.click();
  await page.waitForTimeout(3000);
  console.log('[2] 已打開建立帖子');
  
  // 附加圖片
  const photoBtn = page.locator('[role="dialog"] [aria-label*="相片"], [role="dialog"] [aria-label*="影片"]').first();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    photoBtn.click()
  ]);
  await fileChooser.setFiles(image);
  console.log('[3] 圖片已附加');
  
  // 等待圖片加載（不按 Escape！）
  await page.waitForTimeout(5000);
  console.log('[4] 等待圖片加載完成');
  
  // 輸入文字
  const editor = page.locator('[role="dialog"] [contenteditable="true"][data-lexical-editor="true"]').first();
  await editor.click();
  await page.waitForTimeout(1000);
  
  const text = `【${getAIText()}】\n🚗 港車北上保險首選！¥1469 起！\n永誠保險\n✅ 交強險 + 商業險\n📱 WhatsApp: 85221101144\n#港車北上 #汽車保險`;
  
  await page.keyboard.type(text, { delay: 20 });
  await page.waitForTimeout(2000);
  
  // 驗證文字
  const editorText = await editor.textContent();
  console.log(`[5] 文字已輸入 (${editorText.length} 字)`);
  
  // 截圖確認
  await page.screenshot({ path: '/tmp/fb_text_visible.png', fullPage: false });
  console.log('[5b] 截圖已保存');
  
  // 點擊發佈
  for (let i = 0; i < 20; i++) {
    const postBtn = page.locator('[role="dialog"] [role="button"]:has-text("發佈")').first();
    if ((await postBtn.count())) {
      const disabled = await postBtn.getAttribute('aria-disabled');
      if (disabled !== 'true') {
        await postBtn.click();
        console.log('[6] 已點擊發佈');
        break;
      }
    }
    await page.waitForTimeout(1000);
  }
  
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/fb_final_result.png', fullPage: false });
  console.log('[7] ✅ 完成');
  
  await browser.close();
})();
