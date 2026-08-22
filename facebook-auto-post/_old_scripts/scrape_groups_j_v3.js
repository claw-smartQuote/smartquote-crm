const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  console.log('正在進入群組發現頁面...');
  await page.goto('https://www.facebook.com/groups/discover', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const groups = new Map();
  let lastCount = 0;
  let noChangeCount = 0;

  console.log('開始滾動採集群組...');

  // Scroll multiple times to load all groups
  for (let scroll = 0; scroll < 30; scroll++) {
    // Extract groups
    const newGroups = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]+)/);
        if (!match) continue;
        
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category', 'search'];
        if (skipIds.includes(groupId)) continue;
        
        // Get group name
        let name = '';
        const span = link.querySelector('span[dir="auto"]');
        if (span) {
          name = span.textContent.trim();
        } else {
          // Try to get from aria-label or title
          name = link.getAttribute('aria-label') || link.getAttribute('title') || link.textContent.trim();
        }
        
        if (name && name.length > 1 && name.length < 300) {
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
      console.log(`第 ${scroll + 1} 次滾動: 已找到 ${groups.size} 個群組`);
      lastCount = groups.size;
      noChangeCount = 0;
    } else {
      noChangeCount++;
      if (noChangeCount >= 5) {
        console.log('連續 5 次無新增群組，停止滾動');
        break;
      }
    }

    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(2000);
  }

  // Now also check the sidebar "你的群組" section
  console.log('\n檢查側邊欄群組...');
  
  // Go to groups feed to check sidebar
  await page.goto('https://www.facebook.com/groups/feed', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Scroll sidebar to load more groups
  for (let i = 0; i < 10; i++) {
    const sidebarGroups = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]+)/);
        if (!match) continue;
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category', 'search'];
        if (skipIds.includes(groupId)) continue;
        const span = link.querySelector('span[dir="auto"]');
        const name = span ? span.textContent.trim() : link.textContent.trim();
        if (name && name.length > 1 && name.length < 300) {
          results.push({ id: groupId, name: name });
        }
      }
      return results;
    });
    
    for (const g of sidebarGroups) {
      if (!groups.has(g.id)) {
        groups.set(g.id, g);
      }
    }
    
    // Try to scroll sidebar
    await page.evaluate(() => {
      const sidebar = document.querySelector('[role="navigation"]') || document.querySelector('div[style*="overflow"]');
      if (sidebar) sidebar.scrollBy(0, 500);
    });
    await page.waitForTimeout(1000);
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
