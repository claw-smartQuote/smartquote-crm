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

  // 先看看頁面上所有群組連結的結構
  const linkInfo = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/groups/"]');
    const result = [];
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim().substring(0, 80);
      result.push({ href, text });
    }
    return result;
  });
  console.log(`頁面上群組連結數: ${linkInfo.length}`);
  linkInfo.slice(0, 5).forEach(l => console.log(`  ${l.href} -> ${l.text}`));

  // 開始滾動左側邊欄
  console.log('\n開始滾動邊欄...');
  const groups = new Map();
  let noNewCount = 0;

  for (let round = 0; round < 500; round++) {
    const newGroups = await page.evaluate(() => {
      const result = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        // 匹配 /groups/123456 或 /groups/123456/
        const match = href.match(/\/groups\/(\d+)/);
        if (!match) continue;
        const groupId = match[1];
        // 取第一行文字作為群組名稱
        let name = link.textContent?.trim().split('\n')[0].trim();
        // 移除「上次在線時間」
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
      if (groups.size % 5 === 0 || added > 0) console.log(`已找到 ${groups.size} 個群組`);
    } else {
      noNewCount++;
      if (noNewCount >= 25) {
        console.log(`連續 ${noNewCount} 次無新增，停止`);
        break;
      }
    }

    // 滾動左側邊欄容器
    await page.evaluate(() => {
      // 找到包含群組連結的可滾動容器
      const containers = document.querySelectorAll('div');
      for (const div of containers) {
        if (div.scrollHeight > div.clientHeight + 10) {
          const style = window.getComputedStyle(div);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'hidden') {
            // 檢查是否包含群組連結
            if (div.querySelector('a[href*="/groups/"]')) {
              div.scrollTop += 200;
            }
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
