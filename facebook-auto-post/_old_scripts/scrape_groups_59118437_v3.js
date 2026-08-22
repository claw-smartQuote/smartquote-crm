const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  console.log('進入群組頁面...');
  await page.goto('https://www.facebook.com/groups/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  if (page.url().includes('login')) {
    console.log('❌ 未登入');
    await page.close();
    return;
  }

  // 點擊「查看全部」
  console.log('嘗試點擊「查看全部」...');
  const clicked = await page.evaluate(() => {
    const links = document.querySelectorAll('a, div[role="button"], span');
    for (const el of links) {
      if (el.textContent?.includes('查看全部') && el.offsetParent !== null) {
        el.click();
        return true;
      }
    }
    return false;
  });
  console.log('點擊「查看全部」:', clicked);
  await page.waitForTimeout(3000);

  // 如果沒點到，嘗試直接導航到 groups/feeds
  if (!clicked) {
    console.log('嘗試直接導航...');
    await page.goto('https://www.facebook.com/groups/joins', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: '/tmp/fb_groups_all.png' });
  console.log('截圖已保存');

  // 開始滾動採集
  const groups = new Map();
  let noNewCount = 0;

  for (let round = 0; round < 300; round++) {
    const newGroups = await page.evaluate(() => {
      const result = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/groups\/(\d+)$/);
        if (!match) continue;
        const groupId = match[1];
        const text = link.textContent?.trim().split('\n')[0].trim();
        if (text && text.length > 1 && text.length < 200) {
          result.push({ id: groupId, name: text });
        }
      }
      return result;
    });

    let added = 0;
    for (const g of newGroups) {
      if (!groups.has(g.id)) {
        groups.set(g.id, g);
        added++;
      }
    }

    if (added > 0) {
      noNewCount = 0;
      if (round % 10 === 0) console.log(`已找到 ${groups.size} 個群組...`);
    } else {
      noNewCount++;
      if (noNewCount >= 20) {
        console.log(`連續 ${noNewCount} 次無新增，停止`);
        break;
      }
    }

    // 滾動頁面
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(600);
  }

  const groupList = Array.from(groups.values());
  console.log(`\n總共找到 ${groupList.length} 個群組`);

  const data = {
    account: '+852****8437',
    scraped_at: new Date().toISOString(),
    total: groupList.length,
    groups: groupList
  };
  fs.writeFileSync('./fb_groups_59118437.json', JSON.stringify(data, null, 2));
  console.log('已保存至 fb_groups_59118437.json');

  console.log('\n完整群組列表:');
  groupList.forEach((g, i) => {
    console.log(`${i + 1}. [${g.id}] ${g.name}`);
  });

  await page.close();
})();
