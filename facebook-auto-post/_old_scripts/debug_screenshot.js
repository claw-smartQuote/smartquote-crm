/**
 * 截圖調試腳本 - 查看群組頁面實際 UI
 */

const { chromium } = require('playwright');

async function main() {
  console.log('連接到 Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = await context.newPage();

  // 導航到第一個群組
  await page.goto('https://www.facebook.com/groups/1285040048765619', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(3000);

  // 截圖
  await page.screenshot({ path: '/tmp/fb_group_debug.png', fullPage: false });
  console.log('截圖已保存到 /tmp/fb_group_debug.png');

  // 嘗試列印頁面標題
  const title = await page.title();
  console.log('頁面標題:', title);
  console.log('當前URL:', page.url());

  // 嘗試找建立帖子相關元素
  const selectors = [
    'button:has-text("建立帖子")',
    'button:has-text("建立-post")',
    'button:has-text("What\'s on your mind")',
    'button:has-text("發文")',
    'div[aria-label*="寫"]',
    'div[contenteditable="true"]',
    'textarea[name="xhpc_message"]',
  ];

  console.log('\n=== 查找發文相關元素 ===');
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible();
        const tagName = await el.evaluate(e => e.tagName);
        const text = await el.evaluate(e => e.textContent?.substring(0, 50));
        const ariaLabel = await el.evaluate(e => e.getAttribute('aria-label'));
        console.log(`✅ ${sel} - 標籤:${tagName} 可見:${visible} 文字:${text} aria-label:${ariaLabel}`);
      }
    } catch (e) {
      console.log(`❌ ${sel}: ${e.message}`);
    }
  }

  await browser.close();
}

main();
