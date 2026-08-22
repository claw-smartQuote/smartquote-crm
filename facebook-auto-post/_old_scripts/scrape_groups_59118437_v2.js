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

  console.log('開始滾動左側「我加入的群組」邊欄...');
  const groups = new Map();
  let noNewCount = 0;

  // 先找到左側邊欄的滾動容器
  for (let round = 0; round < 500; round++) {
    // 從頁面提取群組連結
    const newGroups = await page.evaluate(() => {
      const result = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/groups\/(\d+)$/);
        if (!match) continue;
        const groupId = match[1];
        // 取得群組名稱（只取第一行文字）
        const span = link.querySelector('span');
        let name = '';
        if (span) {
          name = span.textContent?.trim().split('\n')[0].trim();
        }
        if (!name) {
          name = link.textContent?.trim().split('\n')[0].trim();
        }
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
      if (round % 5 === 0) console.log(`已找到 ${groups.size} 個群組...`);
    } else {
      noNewCount++;
      if (noNewCount >= 30) {
        console.log(`連續 ${noNewCount} 次無新增，停止`);
        break;
      }
    }

    // 滾動左側邊欄 - 多種方式嘗試
    await page.evaluate(() => {
      // 方法1: 找所有可滾動的 div
      const scrollables = document.querySelectorAll('div');
      for (const div of scrollables) {
        const style = window.getComputedStyle(div);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight) {
          // 檢查是否包含群組連結
          if (div.querySelector('a[href*="/groups/"]')) {
            div.scrollTop += 300;
          }
        }
      }
    });
    await page.waitForTimeout(800);
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
