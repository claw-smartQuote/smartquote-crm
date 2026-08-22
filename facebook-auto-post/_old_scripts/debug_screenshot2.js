/**
 * 截圖調試腳本 v2 - 滾到頂部後查找
 */

const { chromium } = require('playwright');

async function main() {
  console.log('連接到 Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/1285040048765619', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  // 滾到頂部
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/fb_group_top.png', fullPage: false });
  console.log('截圖已保存 (頂部)');

  const title = await page.title();
  console.log('頁面標題:', title);

  const selectors = [
    'button:has-text("建立帖子")',
    'button:has-text("建立-post")',
    "button:has-text('What\\'s on your mind')",
    'button:has-text("寫點")',
    'div[aria-label*="寫"]',
    'div[contenteditable="true"]',
    'textarea[name="xhpc_message"]',
    'div[role="composer"]',
  ];

  console.log('\n=== 查找發文相關元素 ===');
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      const visible = await el.isVisible();
      const tagName = await el.evaluate(e => e.tagName);
      const text = await el.evaluate(e => e.textContent?.substring(0, 80));
      const ariaLabel = await el.evaluate(e => e.getAttribute('aria-label'));
      const rect = await el.boundingBox();
      console.log(`✅ ${sel} - 可見:${visible} 位置:[${rect?.x},${rect?.y}] aria-label:${ariaLabel} 文字:${text?.substring(0,30)}`);
    }
  }

  await browser.close();
}

main();
