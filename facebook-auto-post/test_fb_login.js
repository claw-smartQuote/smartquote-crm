/**
 * Facebook 登入 + 搜索測試
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
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();

  console.log('打開 Facebook 登入頁...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await delay(2000);
  
  console.log('URL:', page.url());
  
  // 截圖
  await page.screenshot({ path: '/tmp/fb_login_test.png' });
  console.log('截圖: /tmp/fb_login_test.png');
  
  // 嘗試找到輸入框
  const body = await page.$eval('body', el => el.innerHTML.slice(0, 500));
  console.log('Body 前500字符:', body.replace(/\s+/g, ' '));
  
  // 嘗試常見的 email/password 輸入框
  const emailInput = await page.$('input[name="email"], input[id="email"], input[type="email"]');
  const passInput = await page.$('input[name="pass"], input[id="pass"], input[type="password"]');
  
  if (emailInput && passInput) {
    console.log('\n找到登入框，填寫中...');
    await emailInput.fill(CONFIG.account);
    await delay(500);
    await passInput.fill(CONFIG.password);
    await delay(500);
    
    const loginBtn = await page.$('button[name="login"], button[type="submit"]');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForURL('**/facebook.com/**', { timeout: 10000 });
      console.log('登入後 URL:', page.url());
      await page.screenshot({ path: '/tmp/fb_after_login.png' });
      
      // 保存 storage state
      await context.storageState({ path: CONFIG.storageStateFile });
      console.log('已保存 storage state');
      
      // 測試搜索
      await delay(2000);
      const searchBox = await page.$('[placeholder*="搜尋"], [placeholder*="Search"], [aria-label*="搜尋"], [aria-label*="Search"]');
      console.log('\n搜索框:', searchBox ? '找到' : '未找到');
      
      if (searchBox) {
        await searchBox.click();
        await searchBox.type('港車北上', { delay: 80 });
        await delay(500);
        await page.keyboard.press('Enter');
        await page.waitForURL('**search**', { timeout: 10000 });
        console.log('搜索後 URL:', page.url());
        await delay(3000);
        
        // 分析結果
        const groupLinks = await page.$$eval('a[href*="/groups/"]', links => {
          const seen = new Set();
          return links
            .map(a => {
              const match = a.href.match(/\/groups\/([^/?]+)/);
              if (match && !seen.has(match[1])) {
                seen.add(match[1]);
                return { id: match[1], text: a.textContent.trim().slice(0, 100) };
              }
            })
            .filter(Boolean);
        });
        console.log(`\n找到 ${groupLinks.length} 個群組`);
        groupLinks.slice(0, 10).forEach(g => console.log(`  ${g.text} (${g.id})`));
      }
    }
  } else {
    console.log('未找到登入框！');
    // 可能是已登入狀態
    if (page.url().includes('login')) {
      console.log('但在 login 頁面... 需要人工確認');
    } else {
      console.log('已登入，URL:', page.url());
    }
  }
  
  await delay(3000);
  await browser.close();
  console.log('\n完成');
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
