/**
 * 檢查帳戶是否已加入群組
 */

const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = await context.newPage();

  const groupIds = ['677542026211378', '536453245227258', '123697684460515', '1125529134145610'];

  for (const gid of groupIds) {
    await page.goto(`https://www.facebook.com/groups/${gid}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      // 檢查是否有「加入小組」按鈕
      const joinBtn = document.querySelector('div[aria-label*="加入小组"], div[aria-label*="加入小組"]');
      const joined = document.querySelector('div[aria-label*="已加入"], div[aria-label*="已成員"]');
      const composer = document.querySelector('span');
      
      // 找「写点什么...」
      const writeElements = [];
      document.querySelectorAll('span, div').forEach(el => {
        if (el.textContent.trim() === '写点什么...') {
          writeElements.push({
            tag: el.tagName,
            y: el.getBoundingClientRect().top,
            visible: el.offsetParent !== null
          });
        }
      });
      
      return {
        hasJoinButton: !!joinBtn,
        hasJoinedBadge: !!joined,
        writeElements,
        url: window.location.href
      };
    });

    console.log(`\n群組 ${gid}:`);
    console.log(`  URL: ${result.url}`);
    console.log(`  有「加入小組」按鈕: ${result.hasJoinButton}`);
    console.log(`  已加入標記: ${result.hasJoinedBadge}`);
    console.log(`  「写点什么...」元素: ${JSON.stringify(result.writeElements)}`);
  }

  await browser.close();
}

main();
