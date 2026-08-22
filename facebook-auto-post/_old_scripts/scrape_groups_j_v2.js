const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  console.log('正在進入「你的群組」頁面...');
  
  // Go to your groups page
  await page.goto('https://www.facebook.com/groups/your_groups', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const groups = new Map();
  let lastCount = 0;
  let noChangeCount = 0;
  const maxNoChange = 10;

  console.log('開始滾動採集群組...');

  while (noChangeCount < maxNoChange) {
    // Extract groups from visible elements
    const newGroups = await page.evaluate(() => {
      const results = [];
      
      // Method 1: Look for group links with various patterns
      const allLinks = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]*)/);
        if (!match) continue;
        
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category'];
        if (skipIds.includes(groupId)) continue;
        
        // Get the group name from the link or its parent
        let name = '';
        const span = link.querySelector('span[dir="auto"]');
        if (span) {
          name = span.textContent.trim();
        } else {
          name = link.textContent.trim();
        }
        
        if (name && name.length > 1 && name.length < 300 && !name.includes('加入') && !name.includes('Join')) {
          results.push({ id: groupId, name: name });
        }
      }
      
      // Method 2: Look for group cards
      const cards = document.querySelectorAll('[role="article"], [data-pagelet*="Groups"]');
      for (const card of cards) {
        const link = card.querySelector('a[href*="/groups/"]');
        if (!link) continue;
        const href = link.getAttribute('href');
        if (!href) continue;
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]*)/);
        if (!match) continue;
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category'];
        if (skipIds.includes(groupId)) continue;
        
        const titleEl = card.querySelector('span[dir="auto"], h3, h4');
        const name = titleEl ? titleEl.textContent.trim() : link.textContent.trim();
        
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

    if (groups.size === lastCount) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
      lastCount = groups.size;
      console.log(`已找到 ${groups.size} 個群組...`);
    }

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(1500);
  }

  // Also try scrolling the main content area
  console.log('嘗試滾動主要內容區域...');
  
  noChangeCount = 0;
  while (noChangeCount < 5) {
    await page.evaluate(() => {
      const main = document.querySelector('[role="main"]') || document.querySelector('div[style*="overflow"]');
      if (main) {
        main.scrollBy(0, 1000);
      } else {
        window.scrollBy(0, 1000);
      }
    });
    await page.waitForTimeout(2000);
    
    const moreGroups = await page.evaluate(() => {
      const results = [];
      const allLinks = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]*)/);
        if (!match) continue;
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category'];
        if (skipIds.includes(groupId)) continue;
        const span = link.querySelector('span[dir="auto"]');
        const name = span ? span.textContent.trim() : link.textContent.trim();
        if (name && name.length > 1 && name.length < 300) {
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
    
    if (!found) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
      console.log(`已找到 ${groups.size} 個群組...`);
    }
  }

  // Convert to array and save
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

  // Print all groups
  console.log('\n完整群組列表:');
  groupList.forEach((g, i) => {
    console.log(`${i+1}. [${g.id}] ${g.name}`);
  });

  await page.close();
})();
