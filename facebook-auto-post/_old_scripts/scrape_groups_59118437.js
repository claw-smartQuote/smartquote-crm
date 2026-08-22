const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  console.log('進入「我的群組」頁面...');
  await page.goto('https://www.facebook.com/groups/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // 確認登入狀態
  if (page.url().includes('login')) {
    console.log('❌ 未登入，請先登入 Facebook');
    await page.close();
    return;
  }

  console.log('開始滾動左側「我加入的群組」...');
  const groups = new Map();
  let noNewCount = 0;
  const maxNoNew = 20;

  while (noNewCount < maxNoNew) {
    // 從左側邊欄提取群組
    const newGroups = await page.evaluate(() => {
      const result = [];
      // 找左側邊欄中的群組連結
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/groups\/(\d+)/);
        if (!match) continue;
        const groupId = match[1];
        // 從連結文字取得群組名稱
        const text = link.textContent?.trim();
        if (text && text.length > 1 && text.length < 200 && !text.includes('探索群組') && !text.includes('發現')) {
          result.push({ id: groupId, name: text.split('\n')[0].trim() });
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
      console.log(`第 ${groups.size} 次: ${groups.size} 個群組`);
      noNewCount = 0;
    } else {
      noNewCount++;
    }

    // 滾動左側邊欄
    await page.evaluate(() => {
      // 找左側邊欄的可滾動容器
      const sidebar = document.querySelector('[role="navigation"]') || 
                      document.querySelector('div[style*="overflow"]');
      if (sidebar) {
        sidebar.scrollTop += 500;
      }
      // 也嘗試滾動主頁面
      window.scrollBy(0, 500);
    });
    await page.waitForTimeout(1500);
  }

  const groupList = Array.from(groups.values());
  console.log(`\n總共找到 ${groupList.length} 個群組`);

  // 保存
  const data = {
    account: '+85259118437',
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
