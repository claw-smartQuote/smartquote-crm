/**
 * Facebook 搜索格式測試
 */
const { chromium } = require('playwright');
const path = require('path');

const CONFIG = {
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
};

async function main() {
  console.log('啟動 Chromium...');
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
  
  // 設置短超時方便調試
  page.setDefaultTimeout(10000);
  
  console.log('打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  
  console.log('當前 URL:', page.url());
  
  // 方法1: 嘗試在 Facebook 搜索框輸入
  console.log('\n方法1: 在首頁搜索框輸入...');
  try {
    // 找到搜索框
    const searchInput = await page.$('input[placeholder*="搜尋"]');
    if (searchInput) {
      console.log('找到搜索框!');
      await searchInput.click();
      await searchInput.type('港車北上', { delay: 100 });
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      console.log('搜索後 URL:', page.url());
    } else {
      console.log('未找到搜索框，嘗試別的方法...');
    }
  } catch (e) {
    console.log('方法1失敗:', e.message.slice(0, 100));
  }
  
  // 截圖保存
  await page.screenshot({ path: '/tmp/fb_search_test.png', fullPage: false });
  console.log('截圖已保存到 /tmp/fb_search_test.png');
  
  // 查看頁面元素
  const url = page.url();
  if (url.includes('search')) {
    console.log('\n在搜索結果頁面，分析元素...');
    const h3s = await page.$$eval('h3', els => els.map(e => e.textContent.trim()).filter(t => t.length > 0).slice(0, 10));
    console.log('H3 元素:', h3s);
    
    // 查找群組連結
    const groupLinks = await page.$$eval('a[href*="/groups/"]', links => {
      const seen = new Set();
      return links
        .map(a => {
          const match = a.href.match(/\/groups\/([^/?]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            return { id: match[1], text: a.textContent.trim().slice(0, 80) };
          }
        })
        .filter(Boolean)
        .slice(0, 15);
    });
    console.log(`\n找到 ${groupLinks.length} 個群組:`);
    groupLinks.forEach(g => console.log(`  [${g.id}] ${g.text}`));
  }
  
  await page.waitForTimeout(2000);
  await browser.close();
  console.log('\n完成！');
}

main().catch(e => {
  console.error('錯誤:', e);
  process.exit(1);
});
