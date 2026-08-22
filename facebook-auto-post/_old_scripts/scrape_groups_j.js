const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Check current account
  await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const profileName = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return h1 ? h1.textContent : 'unknown';
  });
  console.log('當前賬戶:', profileName);
  console.log('URL:', page.url());

  // Go to groups page
  await page.goto('https://www.facebook.com/groups/feed', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click on "你的群組" (Your Groups) link
  console.log('正在進入群組列表...');
  
  // Navigate to groups list directly
  await page.goto('https://www.facebook.com/groups/joins', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to load all groups
  const groups = new Map();
  let lastCount = 0;
  let scrollAttempts = 0;
  const maxScrolls = 50;

  while (scrollAttempts < maxScrolls) {
    // Extract group info from the page
    const newGroups = await page.evaluate(() => {
      const results = [];
      // Look for group links
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        // Extract group ID from URL
        const match = href.match(/\/groups\/(\d+|[a-zA-Z0-9._-]+)/);
        if (!match) continue;
        
        const groupId = match[1];
        if (groupId === 'feed' || groupId === 'joins' || groupId === 'create' || groupId === 'discover') continue;
        
        // Try to get group name
        const nameEl = link.querySelector('span') || link;
        let name = nameEl.textContent.trim();
        
        // Clean up name
        if (name && name.length > 0 && name.length < 200) {
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
      scrollAttempts++;
      if (scrollAttempts >= 3) break;
    } else {
      scrollAttempts = 0;
      lastCount = groups.size;
      console.log(`已找到 ${groups.size} 個群組...`);
    }

    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
  }

  // Also check "你的群組" page
  await page.goto('https://www.facebook.com/groups/your_groups', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  scrollAttempts = 0;
  while (scrollAttempts < 20) {
    const moreGroups = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/groups/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const match = href.match(/\/groups\/(\d+|[a-zA-Z0-9._-]+)/);
        if (!match) continue;
        const groupId = match[1];
        if (['feed', 'joins', 'create', 'discover', 'your_groups', 'notifications', 'suggestions'].includes(groupId)) continue;
        const nameEl = link.querySelector('span') || link;
        let name = nameEl.textContent.trim();
        if (name && name.length > 0 && name.length < 200) {
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
      scrollAttempts++;
      if (scrollAttempts >= 3) break;
    } else {
      scrollAttempts = 0;
      console.log(`已找到 ${groups.size} 個群組...`);
    }

    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
  }

  // Convert to array and save
  const groupList = Array.from(groups.values());
  console.log(`\n總共找到 ${groupList.length} 個群組`);

  // Save to file
  const output = {
    account: profileName,
    email: 'j@smartquote.cn',
    scraped_at: new Date().toISOString(),
    total: groupList.length,
    groups: groupList
  };

  const filename = `fb_groups_j_${Date.now()}.json`;
  fs.writeFileSync(`./${filename}`, JSON.stringify(output, null, 2));
  console.log(`已保存到 ${filename}`);

  // Print first 10 groups
  console.log('\n前 10 個群組:');
  groupList.slice(0, 10).forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.id} - ${g.name}`);
  });

  await page.close();
})();
