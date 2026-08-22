/**
 * 截圖調試腳本 v3 - 全頁截圖
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
  await page.waitForTimeout(3000);

  // 全頁截圖
  await page.screenshot({ path: '/tmp/fb_group_full.png', fullPage: true });
  console.log('全頁截圖已保存');

  // 滾動並截圖多個位置
  for (let y of [0, 500, 1000, 1500, 2000]) {
    await page.evaluate((yPos) => window.scrollTo(0, yPos), y);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/fb_group_scroll_${y}.png` });
    console.log(`截圖 Y=${y}`);
  }

  // 查找所有按鈕和可編輯元素
  const allButtons = await page.$$('button');
  console.log(`\n=== 按鈕數量: ${allButtons.length} ===`);
  for (const btn of allButtons.slice(0, 20)) {
    const text = await btn.evaluate(e => e.textContent?.substring(0, 50));
    const ariaLabel = await btn.evaluate(e => e.getAttribute('aria-label'));
    const visible = await btn.isVisible();
    if (visible && (text || ariaLabel)) {
      console.log(`  btn: "${text}" aria:${ariaLabel}`);
    }
  }

  // 查找所有 contenteditable
  const editables = await page.$$('[contenteditable="true"]');
  console.log(`\n=== contenteditable 數量: ${editables.length} ===`);
  for (const el of editables) {
    const ariaLabel = await el.evaluate(e => e.getAttribute('aria-label'));
    const visible = await el.isVisible();
    const rect = await el.boundingBox();
    console.log(`  editable: aria-label:${ariaLabel} 可見:${visible} 位置:[${rect?.x},${rect?.y}]`);
  }

  await browser.close();
  console.log('\n完成!');
}

main();
