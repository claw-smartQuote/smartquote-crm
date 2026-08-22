/**
 * Facebook 登入 + 搜索群組 - 完整版
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  account: 'to@smartquote.cn',
  password: 'Pin4fb123',
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
};

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('啟動 Chromium...');
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  console.log('打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  await delay(2000);
  console.log('URL:', page.url());

  // 檢查是否已登入
  let needsLogin = page.url().includes('login');
  
  if (needsLogin) {
    console.log('需要登入...');
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.fill('input[name="email"]', CONFIG.account);
    await delay(500);
    await page.fill('input[name="pass"]', CONFIG.password);
    await delay(300);
    await page.click('button[name="login"]');
    console.log('點擊登入，等待...');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    console.log('登入後 URL:', page.url());
    await context.storageState({ path: CONFIG.storageStateFile });
    console.log('已保存登入狀態');
  } else {
    console.log('已登入！');
  }

  await delay(3000);

  // ===== 搜索測試 =====
  console.log('\n===== 開始搜索 =====');
  
  // 方法1: 直接 URL 搜索
  const searchKeyword = '港車北上';
  const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(searchKeyword)}`;
  console.log('搜索:', searchUrl);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await delay(4000);
  
  console.log('搜索頁 URL:', page.url());
  
  // 滾動
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1000);
  }
  
  // 提取群組
  const groupLinks = await page.$$eval('a[href*="/groups/"]', links => {
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
  
  console.log(`\n找到 ${groupLinks.length} 個群組:`);
  groupLinks.slice(0, 15).forEach(g => console.log(`  [${g.id}] ${g.text}`));
  
  // ===== 加入第一個群組測試 =====
  if (groupLinks.length > 0) {
    console.log('\n===== 測試加入群組 =====');
    const firstGroup = groupLinks[0];
    console.log(`打開群組: ${firstGroup.text}`);
    
    await page.goto(`https://www.facebook.com/groups/${firstGroup.id}`, { waitUntil: 'networkidle', timeout: 20000 });
    await delay(3000);
    
    // 查找加入按鈕
    const joinBtnText = await page.$eval('body', el => {
      const text = el.textContent;
      if (text.includes('加入群組')) {
        const idx = text.indexOf('加入群組');
        return text.slice(Math.max(0, idx - 50), idx + 100);
      }
      return null;
    });
    console.log('加入按鈕上下文:', joinBtnText);
    
    // 嘗試點擊
    const joinBtn = await page.getByText('加入群組', { exact: false }).first();
    if (joinBtn) {
      console.log('找到加入按鈕，點擊...');
      await joinBtn.scrollIntoViewIfNeeded();
      await joinBtn.click();
      await delay(2000);
      console.log('點擊後 URL:', page.url());
    }
  }
  
  await delay(3000);
  await browser.close();
  console.log('\n完成！');
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
