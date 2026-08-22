const { chromium } = require('playwright');

const image = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg/02.jpeg';

function getAIText() {
  const today = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;
  const weather = ['駕駛北上，記得檢查車況，確保行車安全。', '路面濕滑，請注意車距，減速慢行。'];
  const greeting = ['祝你旅途平安！', '願您一路順風！'];
  return `${dateStr} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  // 直接導航到可發文的群組
  await page.goto('https://www.facebook.com/groups/414054913244649/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('[1] 導航完成');
  
  // 點擊「寫點內容」
  const writeSpan = page.locator('span:has-text("寫點內容")').first();
  await writeSpan.click();
  await page.waitForTimeout(3000);
  console.log('[2] 已打開建立帖子');
  
  // 附加圖片 (filechooser)
  const photoBtn = page.locator('[role="dialog"] [aria-label*="相片"], [role="dialog"] [aria-label*="影片"]').first();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    photoBtn.click()
  ]);
  await fileChooser.setFiles(image);
  console.log('[3] 圖片已附加');
  await page.waitForTimeout(2000);
  
  // **重要：Escape 關閉檔案選擇框**
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  console.log('[4] 已按 Escape 關閉檔案選擇框');
  
  // 輸入文字
  const editor = page.locator('[role="dialog"] [contenteditable="true"][data-lexical-editor="true"]').first();
  await editor.click();
  await page.waitForTimeout(1000);
  
  const text = `【${getAIText()}】\n🚗 港車北上保險首選！¥1469 起！\n永誠保險 — 香港人正規註冊國內保險公司代理人\n✅ 交強險 + 商業第三者責任險 + 醫保外藥用險\n✅ 12次道路救援（拖車、送油、換胎）\n📱 WhatsApp: 85221101144\n📞 94924444\n#港車北上 #汽車保險 #保費 #續保`;
  
  await page.keyboard.type(text, { delay: 20 });
  await page.waitForTimeout(2000);
  
  // 驗證文字
  const editorText = await editor.textContent();
  console.log(`[5] 文字已輸入 (${editorText.length} 字)`);
  
  // 截圖確認文字可見
  await page.screenshot({ path: '/tmp/fb_text_check.png', fullPage: false });
  
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
  
  // 截圖確認結果
  await page.screenshot({ path: '/tmp/fb_post_result2.png', fullPage: false });
  console.log('[7] ✅ 完成');
  
  await browser.close();
})();
