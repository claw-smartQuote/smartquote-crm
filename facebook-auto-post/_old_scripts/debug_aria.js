/**
 * 調試：列出所有 aria-label 包含中文的 div
 */

const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/1285040048765619', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);

  // 查找所有包含中文 aria-label 的元素
  const result = await page.evaluate(() => {
    const elements = document.querySelectorAll('div, span, button');
    const labels = [];
    for (const el of elements) {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && /[\u4e00-\u9fff]/.test(ariaLabel)) {
        labels.push({
          tag: el.tagName,
          ariaLabel: ariaLabel.substring(0, 100),
          visible: el.offsetParent !== null,
          rect: el.getBoundingClientRect ? JSON.stringify(el.getBoundingClientRect()) : 'N/A'
        });
      }
    }
    return labels;
  });

  console.log('=== 包含中文 aria-label 的元素 ===');
  for (const item of result) {
    console.log(`[${item.tag}] "${item.ariaLabel}" 可見:${item.visible} 位置:${item.rect}`);
  }

  // 也列出所有含 "写" 或 "發" 或 "文" 的元素
  const result2 = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    const found = [];
    for (const el of elements) {
      const text = el.textContent || '';
      if (text.includes('写点什么') || text.includes('发点什么') || text.includes('建立帖子')) {
        found.push({
          tag: el.tagName,
          text: text.substring(0, 50).trim(),
          ariaLabel: el.getAttribute('aria-label'),
          rect: el.getBoundingClientRect ? `${Math.round(el.getBoundingClientRect().top)},${Math.round(el.getBoundingClientRect().left)}` : 'N/A'
        });
      }
    }
    return found;
  });

  console.log('\n=== 包含「写点什么」等文字的元素 ===');
  for (const item of result2) {
    console.log(`[${item.tag}] "${item.text}" aria:${item.ariaLabel} 位置:${item.rect}`);
  }

  await browser.close();
}

main();
