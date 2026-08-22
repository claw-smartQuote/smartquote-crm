const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  console.log('進入群組頁面...');
  await page.goto('https://www.facebook.com/groups/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // 讀取已有的群組
  let existing = [];
  try {
    const data = JSON.parse(fs.readFileSync('./fb_groups_59118437.json', 'utf8'));
    existing = data.groups || [];
  } catch(e) {}
  const groups = new Map(existing.map(g => [g.id, g]));
  console.log(`已有 ${groups.size} 個群組，繼續採集...`);

  let noNewCount = 0;

  for (let round = 0; round < 1000; round++) {
    const newGroups = await page.evaluate(() => {
      const result = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/groups\/(\d+)/);
        if (!match) continue;
        const groupId = match[1];
        let name = link.textContent?.trim().split('\n')[0].trim();
        if (name) name = name.replace(/上次在線時間.*$/, '').trim();
        if (name && name.length > 1 && name.length < 200) {
          result.push({ id: groupId, name });
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
      if (groups.size % 20 === 0) console.log(`已找到 ${groups.size} 個群組`);
    } else {
      noNewCount++;
      if (noNewCount >= 50) {
        console.log(`連續 ${noNewCount} 次無新增，停止`);
        break;
      }
    }

    // 滾動左側邊欄
    await page.evaluate(() => {
      const containers = document.querySelectorAll('div');
      for (const div of containers) {
        if (div.scrollHeight > div.clientHeight + 10) {
          const style = window.getComputedStyle(div);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'hidden') {
            if (div.querySelector('a[href*="/groups/"]')) {
              div.scrollTop += 300;
            }
          }
        }
      }
    });
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

  await page.close();
})();
