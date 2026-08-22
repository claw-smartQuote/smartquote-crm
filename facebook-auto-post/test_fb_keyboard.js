/**
 * Facebook 搜索 - 模擬人類用鍵盤快捷鍵
 */
const { chromium } = require('playwright');
const path = require('path');

const CONFIG = {
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
  });
  
  const context = await browser.newContext({
    storageState: CONFIG.storageStateFile,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  console.log('打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await delay(5000);
  
  // 嘗試鍵盤快捷鍵 / 觸發搜索
  console.log('按 / 鍵觸發搜索...');
  await page.keyboard.press('/');
  await delay(2000);
  
  let url = page.url();
  console.log('URL after /:', url);
  
  // 如果沒有打開搜索，嘗試 Alt+/
  if (!url.includes('search')) {
    console.log('按 Alt+/ 觸發搜索...');
    await page.keyboard.press('Alt+/');
    await delay(2000);
    console.log('URL after Alt+/:', page.url());
  }
  
  // 截圖看看現在的狀態
  await page.screenshot({ path: '/tmp/fb_keyboard_search.png' });
  console.log('截圖 /tmp/fb_keyboard_search.png');
  
  // 打印頁面 HTML 片段
  const inputs = await page.$$eval('input', inputs => inputs.map(i => ({
    type: i.type, 
    placeholder: i.placeholder, 
    ariaLabel: i.getAttribute('aria-label'),
    name: i.name,
    id: i.id
  })));
  console.log('\n頁面 input 元素:', JSON.stringify(inputs, null, 2));
  
  // 嘗試直接點擊搜索框
  const searchBox = await page.$('[aria-label="搜尋 Facebook"], [aria-label="Search Facebook"], [placeholder*="搜尋"], [placeholder*="Search"]');
  if (searchBox) {
    console.log('\n找到搜索框!');
    const box = await searchBox.boundingBox();
    console.log('位置:', box);
    await searchBox.click();
    await delay(1000);
    
    // 輸入文字
    await page.keyboard.type('港車北上 groups', { delay: 100 });
    await delay(1000);
    await page.keyboard.press('Enter');
    await delay(5000);
    
    console.log('\n搜索後 URL:', page.url());
    await page.screenshot({ path: '/tmp/fb_after_enter.png' });
    
    // 分析結果
    const groups = await page.$$eval('a[href*="/groups/"]', links => {
      const seen = new Set();
      return links
        .map(a => {
          const match = a.href.match(/\/groups\/([^/?#]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            return { id: match[1], text: a.textContent.trim().slice(0, 80) };
          }
        })
        .filter(Boolean);
    });
    console.log(`\n找到 ${groups.length} 個群組`);
    groups.slice(0, 15).forEach(g => console.log(`  ${g.text} (${g.id})`));
  } else {
    console.log('\n未找到搜索框');
    // 打印所有可見的輸入框
    const allInputs = await page.$$eval('input', els => els.map(e => {
      const s = e.getBoundingClientRect();
      return { type: e.type, placeholder: e.placeholder, visible: s.width > 0 && s.height > 0 };
    }).filter(x => x.visible));
    console.log('可見 input:', JSON.stringify(allInputs, null, 2));
  }
  
  await delay(2000);
  await browser.close();
}

main().catch(e => { console.error('錯誤:', e.message); process.exit(1); });
