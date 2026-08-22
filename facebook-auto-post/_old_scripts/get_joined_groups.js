const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Go to groups feed which shows all groups in sidebar
  await page.goto('https://www.facebook.com/groups/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  });
  await new Promise(r => setTimeout(r, 3000));

  // Try clicking "See more" / "查看更多" in the sidebar
  try {
    const seeMore = page.locator('span:has-text("查看更多"), span:has-text("See more")').first();
    await seeMore.click({ timeout: 3000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.log('No "see more" button found or already expanded');
  }

  // Scroll main page to load more
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 500));
  }

  // Extract all group links
  const groups = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/groups/"]');
    const seen = new Set();
    const result = [];
    links.forEach(a => {
      const match = a.href.match(/groups\/(\d+)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        const name = a.textContent.trim()
          .replace(/上次在線時間.*/, '')
          .replace(/\d+ 則新帖文/, '')
          .replace(/\d+ new posts?/i, '')
          .trim();
        if (name && name.length > 1 && !name.includes('feed') && !name.includes('joins')) {
          result.push({ id: match[1], name: name.substring(0, 60) });
        }
      }
    });
    return result;
  });

  console.log('已加入群組數量:', groups.length);

  // Save to file
  fs.writeFileSync('joined_groups.json', JSON.stringify({ groups, count: groups.length, date: new Date().toISOString() }, null, 2));
  console.log('已保存到 joined_groups.json');

  // Print all
  groups.forEach((g, i) => console.log(`  ${i+1}. ${g.name} | ${g.id}`));

  await page.close();
  await browser.close();
})().catch(e => console.error('Error:', e.message));
