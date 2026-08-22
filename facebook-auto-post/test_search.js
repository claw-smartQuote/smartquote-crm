/**
 * Facebook 搜索 URL 測試
 */
const { chromium } = require('playwright');
const path = require('path');

const CONFIG = {
  account: 'to@smartquote.cn',
  password: 'Pin4fb123',
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
};

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: CONFIG.storageStateFile,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 20000 });
  console.log('URL after goto:', page.url());

  // 測試不同的搜索 URL 格式
  const testUrls = [
    'https://www.facebook.com/search/groups?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A',
    'https://www.facebook.com/groups/?post_search&q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A',
    'https://www.facebook.com/search/groups/?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A',
  ];

  for (const url of testUrls) {
    console.log('\n測試 URL:', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    const groups = await page.$$eval('a[href*="/groups/"]', links => {
      const seen = new Set();
      return links
        .map(a => {
          const match = a.href.match(/\/groups\/([a-zA-Z0-9]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            return { id: match[1], name: a.textContent.trim().slice(0, 60) };
          }
        })
        .filter(g => g && g.name.length > 2);
    });
    
    console.log(`  標題: ${title}`);
    console.log(`  找到 ${groups.length} 個群組`);
    groups.slice(0, 5).forEach(g => console.log(`  - ${g.name} (${g.id})`));
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
