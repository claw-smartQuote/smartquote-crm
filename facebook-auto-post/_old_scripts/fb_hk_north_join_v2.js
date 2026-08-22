/**
 * Facebook 完整登入 + 搜索 + 加入群組
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  account: 'to@smartquote.cn',
  password: 'Pin4fb123',
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  page.setDefaultTimeout(15000);

  // ===== 登入 =====
  console.log('[1] 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await delay(3000);
  
  // 檢查是否在登入頁
  const emailInput = await page.$('input[name="email"]');
  if (emailInput) {
    console.log('[1] 填寫登入...');
    await emailInput.fill(CONFIG.account);
    await delay(400);
    const passInput = await page.$('input[name="pass"]');
    await passInput.fill(CONFIG.password);
    await delay(300);
    const loginBtn = await page.$('button[type="submit"], button[name="login"]');
    await loginBtn.click();
    console.log('[1] 等待登入完成...');
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await delay(5000);
    console.log('[1] 當前 URL:', page.url());
    
    if (!page.url().includes('login')) {
      // 保存成功登入的狀態
      await context.storageState({ path: CONFIG.storageStateFile });
      console.log('[1] ✅ 登入成功，已保存狀態');
    } else {
      console.log('[1] ⚠️ 仍在登入頁，可能需要驗證');
    }
  } else {
    console.log('[1] 不需要登入，已在主頁');
  }
  
  await delay(3000);
  
  // ===== 搜索 =====
  console.log('\n[2] 搜索港車北上群組...');
  
  // 點擊搜索框
  const searchSelectors = [
    '[aria-label="搜尋 Facebook"]',
    '[aria-label="Search Facebook"]',
    'input[placeholder*="搜尋"]',
    'input[placeholder*="Search"]',
    '[data-pagelet*="Search"]',
  ];
  
  let searchFound = false;
  for (const sel of searchSelectors) {
    const el = await page.$(sel);
    if (el) {
      console.log(`[2] 找到: ${sel}`);
      await el.click();
      searchFound = true;
      break;
    }
  }
  
  if (!searchFound) {
    // 用 JS 找
    const found = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const i of inputs) {
        if (i.offsetWidth > 0 && (i.placeholder.includes('搜尋') || i.placeholder.includes('Search') || i.getAttribute('aria-label')?.includes('搜尋'))) {
          i.focus();
          return true;
        }
      }
      // 嘗試找 div 搜索框
      const divs = document.querySelectorAll('div[role="searchbox"], div[aria-label*="搜"], div[aria-label*="Search"]');
      if (divs.length > 0) {
        const inp = divs[0].querySelector('input, textarea');
        if (inp) { inp.focus(); return true; }
      }
      return false;
    });
    if (found) {
      searchFound = true;
      console.log('[2] 通過 JS 找到並 focus 搜索框');
    }
  }
  
  if (searchFound) {
    await delay(500);
    await page.keyboard.type('港車北上', { delay: 100 });
    await delay(800);
    await page.keyboard.press('Enter');
    console.log('[2] 已輸入並按 Enter');
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
    await delay(4000);
  }
  
  console.log('[2] 搜索頁 URL:', page.url());
  
  // 滾動頁面
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1500);
  }
  
  // 提取群組
  const groups = await page.$$eval('a[href*="/groups/"]', links => {
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
  
  console.log(`[2] 找到 ${groups.length} 個群組`);
  groups.slice(0, 15).forEach(g => console.log(`     ${g.text} (${g.id})`));
  
  // 截圖
  await page.screenshot({ path: '/tmp/fb_found_groups.png', fullPage: false });
  console.log('[2] 截圖 /tmp/fb_found_groups.png');
  
  await delay(3000);
  await browser.close();
  console.log('\n完成！');
}

main().catch(e => { console.error('錯誤:', e.message); process.exit(1); });
