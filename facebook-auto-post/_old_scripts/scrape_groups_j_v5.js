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

  console.log('開始滾動左側邊欄「你加入的群組」...');

  // Scroll the left sidebar multiple times
  for (let scroll = 0; scroll < 150; scroll++) {
    // Extract groups from the sidebar
    const newGroups = await page.evaluate(() => {
      const results = [];
      
      // Find all links that point to groups
      const links = document.querySelectorAll('a[href*="/groups/"]');
      
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        // Match group ID pattern
        const match = href.match(/\/groups\/(\d+|[a-zA-Z][a-zA-Z0-9._-]+)\/?$/);
        if (!match) continue;
        
        const groupId = match[1];
        const skipIds = ['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions', 'category', 'search'];
        if (skipIds.includes(groupId)) continue;
        
        // Get group name - look for spans with text
        let name = '';
        const spans = link.querySelectorAll('span[dir="auto"]');
        if (spans.length > 0) {
          name = spans[0].textContent.trim();
        }
        
        if (!name) {
          name = link.textContent.trim();
        }
        
        // Clean up name
        name = name.replace(/公開群組|私密群組|封闭群组|公開|私密/g, '').trim();
        name = name.replace(/\d+\s*位成員.*/g, '').trim();
        name = name.replace(/\d+\s*則新帖文.*/g, '').trim();
        name = name.replace(/\d+\s*分鐘前.*/g, '').trim();
        name = name.replace(/\d+\s*小時前.*/g, '').trim();
        name = name.replace(/\d+\s*天前.*/g, '').trim();
        
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
      if (noChangeCount >= 15) {
        console.log('連續 15 次無新增，停止');
        break;
      }
    }

    // Scroll the left sidebar - find the scrollable container
    await page.evaluate(() => {
      // Method 1: Find by role="navigation"
      const nav = document.querySelector('[role="navigation"]');
      if (nav) {
        // Find the scrollable parent
        let el = nav;
        while (el) {
          const style = window.getComputedStyle(el);
          if (style.overflow === 'auto' || style.overflow === 'scroll' || 
              style.overflowY === 'auto' || style.overflowY === 'scroll') {
            el.scrollBy(0, 600);
            return 'scrolled nav parent';
          }
          el = el.parentElement;
        }
      }
      
      // Method 2: Find all scrollable divs
      const divs = document.querySelectorAll('div');
      for (const div of divs) {
        const style = window.getComputedStyle(div);
        if ((style.overflow === 'auto' || style.overflow === 'scroll' || 
             style.overflowY === 'auto' || style.overflowY === 'scroll') && 
            div.scrollHeight > div.clientHeight) {
          // Check if this div contains group links
          if (div.querySelector('a[href*="/groups/"]')) {
            div.scrollBy(0, 600);
            return 'scrolled div';
          }
        }
      }
      
      return 'no scrollable found';
    });
    
    await page.waitForTimeout(1200);
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
