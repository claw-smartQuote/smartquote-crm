/**
 * Facebook 搜索 - 嘗試多個搜索方法
 */
const { chromium } = require('playwright');
const path = require('path');

const CONFIG = {
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractGroups(page) {
  return await page.$$eval('a[href*="/groups/"]', links => {
    const seen = new Set();
    return links
      .map(a => {
        const match = a.href.match(/\/groups\/([^/?#]+)/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          return { id: match[1], text: a.textContent.trim().slice(0, 100) };
        }
      })
      .filter(Boolean);
  });
}

async function main() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    storageState: CONFIG.storageStateFile,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();

  console.log('打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  await delay(2000);
  
  // 嘗試使用 top search 進行搜索
  console.log('\n===== 方法1: 頂部搜索框 =====');
  try {
    // 嘗試多個搜索框選擇器
    const searchSelectors = [
      'input[placeholder="搜尋 Facebook"]',
      'input[placeholder="Search Facebook"]', 
      'input[aria-label="搜尋 Facebook"]',
      'input[aria-label="Search Facebook"]',
      '[data-pagelet="SearchBox"] input',
      'input[type="search"]',
    ];
    
    let searchInput = null;
    for (const sel of searchSelectors) {
      searchInput = await page.$(sel);
      if (searchInput) {
        console.log(`找到搜索框: ${sel}`);
        break;
      }
    }
    
    if (searchInput) {
      await searchInput.click();
      await delay(500);
      // 模擬人類輸入
      await page.keyboard.type('港車北上', { delay: 80 });
      await delay(800);
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
      await delay(4000);
      console.log('URL:', page.url());
      
      // 滾動
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await delay(1500);
      }
      
      let groups = await extractGroups(page);
      console.log(`找到 ${groups.length} 個群組`);
      groups.slice(0, 10).forEach(g => console.log(`  ${g.text} (${g.id})`));
      
      if (groups.length > 0) {
        console.log('\n成功！開始加入...');
        // ...
      }
    }
  } catch (e) {
    console.log('方法1失敗:', e.message.slice(0, 100));
  }

  // 保存截圖
  await page.screenshot({ path: '/tmp/fb_search2.png', fullPage: false });
  console.log('截圖: /tmp/fb_search2.png');
  
  await delay(2000);
  await browser.close();
}

main().catch(e => { console.error('錯誤:', e.message); process.exit(1); });
