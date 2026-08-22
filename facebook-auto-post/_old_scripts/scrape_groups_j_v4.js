const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  console.log('進入群組頁面...');
  await page.goto('https://www.facebook.com/groups/feed', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const groups = new Map();
  let lastCount = 0;
  let noChangeCount = 0;

  console.log('開始滾動左側邊欄「我的群組」...');

  // Find the left sidebar and scroll it
  for (let scroll = 0; scroll < 100; scroll++) {
    // Extract groups from sidebar
    const newGroups = await page.evaluate(() => {
      const results = [];
      
      // Find all group links in the page
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]+)\/?$/);
        if (!match) continue;
        
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category', 'search'];
        if (skipIds.includes(groupId)) continue;
        
        // Get group name from the link text
        let name = link.textContent.trim();
        
        // Clean up name - remove "公開群組" "私密群組" "X 位成員" etc
        name = name.replace(/公開群組|私密群組|封闭群组|公開|私密/g, '').trim();
        name = name.replace(/\d+\s*位成員.*$/g, '').trim();
        name = name.replace(/\d+\s*則新帖文.*$/g, '').trim();
        name = name.replace(/^\d+\s*分鐘前.*$/g, '').trim();
        name = name.replace(/^\d+\s*小時前.*$/g, '').trim();
        
        if (name && name.length > 1 && name.length < 200) {
          results.push({ id: groupId, name: name });
        }
      }
      return results;
    });

    for (const g of newGroups) {
      if (!groups.has(g.id)) {
        groups.set(g.id, g);
      }
    }

    if (groups.size > lastCount) {
      console.log(`第 ${scroll + 1} 次滾動: ${groups.size} 個群組`);
      lastCount = groups.size;
      noChangeCount = 0;
    } else {
      noChangeCount++;
      if (noChangeCount >= 8) {
        console.log('連續 8 次無新增，停止');
        break;
      }
    }

    // Scroll the left sidebar
    await page.evaluate(() => {
      // Find the scrollable sidebar container
      const containers = document.querySelectorAll('[role="navigation"], div[style*="overflow"]');
      for (const c of containers) {
        // Check if this container has group links
        if (c.querySelector('a[href*="/groups/"]')) {
          c.scrollBy(0, 800);
          return;
        }
      }
      // Fallback: scroll the window
      window.scrollBy(0, 0); // Don't scroll main page
    });
    await page.waitForTimeout(1500);
  }

  // Also try clicking "查看全部" (View All) if available
  console.log('\n嘗試點擊「查看全部」...');
  try {
    const viewAll = page.locator('a:has-text("查看全部"), a:has-text("View All")').first();
    if (await viewAll.isVisible({ timeout: 3000 })) {
      await viewAll.click();
      await page.waitForTimeout(5000);
      console.log('已點擊「查看全部」');
      
      // Scroll the new page to load all groups
      for (let i = 0; i < 30; i++) {
        const moreGroups = await page.evaluate(() => {
          const results = [];
          const links = document.querySelectorAll('a[href*="/groups/"]');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (!href) continue;
            const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]+)\/?$/);
            if (!match) continue;
            const groupId = match[1];
            const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category', 'search'];
            if (skipIds.includes(groupId)) continue;
            let name = link.textContent.trim();
            name = name.replace(/公開群組|私密群組|封闭群组|公開|私密/g, '').trim();
            name = name.replace(/\d+\s*位成員.*$/g, '').trim();
            name = name.replace(/\d+\s*則新帖文.*$/g, '').trim();
            if (name && name.length > 1 && name.length < 200) {
              results.push({ id: groupId, name: name });
            }
          }
          return results;
        });
        
        let found = false;
        for (const g of moreGroups) {
          if (!groups.has(g.id)) {
            groups.set(g.id, g);
            found = true;
          }
        }
        
        if (found) {
          console.log(`頁面滾動: ${groups.size} 個群組`);
        }
        
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(1500);
        
        if (!found && i > 5) break;
      }
    }
  } catch (e) {
    console.log('查看全部按鈕不可用:', e.message);
  }

  const groupList = Array.from(groups.values());
  console.log(`\n總共找到 ${groupList.length} 個群組`);

  const output = {
    account: 'j@smartquote.cn',
    scraped_at: new Date().toISOString(),
    total: groupList.length,
    groups: groupList
  };

  fs.writeFileSync('./fb_groups_j_account.json', JSON.stringify(output, null, 2));
  console.log('已保存到 fb_groups_j_account.json');

  console.log('\n完整群組列表:');
  groupList.forEach((g, i) => {
    console.log(`${i + 1}. [${g.id}] ${g.name}`);
  });

  await page.close();
})();
