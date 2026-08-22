/**
 * Facebook 完整登入 + 搜索 + 加入群組 v3
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

  // ===== 登入 =====
  console.log('[1] 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await delay(5000);
  
  // 檢查是否在登入頁
  const emailInput = await page.$('input[name="email"]');
  if (emailInput) {
    console.log('[1] 填寫登入資料...');
    await emailInput.fill(CONFIG.account);
    await delay(400);
    
    const passInput = await page.$('input[name="pass"]');
    if (passInput) {
      await passInput.fill(CONFIG.password);
      await delay(300);
    }
    
    // 嘗試點擊 submit 按鈕
    const btn = await page.$('button[type="submit"]');
    if (btn) {
      console.log('[1] 點擊 submit 按鈕...');
      await btn.click();
    } else {
      // 嘗試 Enter 鍵提交
      console.log('[1] 按 Enter 提交...');
      await page.keyboard.press('Enter');
    }
    
    console.log('[1] 等待登入完成...');
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await delay(5000);
    console.log('[1] 當前 URL:', page.url());
    
    if (!page.url().includes('login')) {
      await context.storageState({ path: CONFIG.storageStateFile });
      console.log('[1] ✅ 登入成功，已保存狀態');
    } else {
      console.log('[1] ⚠️ 可能需要驗證');
      await page.screenshot({ path: '/tmp/fb_needs_verify.png' });
    }
  } else {
    console.log('[1] 已登入或不在登入頁');
    console.log('[1] URL:', page.url());
  }
  
  await delay(3000);
  
  // ===== 搜索 =====
  console.log('\n[2] 搜索港車北上群組...');
  
  // 嘗試找到搜索框
  let searchFound = false;
  
  // 方法1: aria-label
  for (const label of ['搜尋 Facebook', 'Search Facebook', '搜尋', 'Search']) {
    const el = await page.$(`[aria-label="${label}"]`);
    if (el) {
      console.log(`[2] 找到搜索框: aria-label="${label}"`);
      await el.click();
      searchFound = true;
      break;
    }
  }
  
  // 方法2: JS 遍歷
  if (!searchFound) {
    const found = await page.evaluate(() => {
      // 找所有可見的 input
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const i of inputs) {
        const rect = i.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20 && rect.height < 60 && !i.type?.match(/hidden|checkbox|radio/)) {
          const ph = (i.placeholder || '').toLowerCase();
          if (ph.includes('搜') || ph.includes('search')) {
            i.focus();
            return 'found: ' + ph;
          }
        }
      }
      return null;
    });
    if (found) {
      console.log('[2] JS 找到:', found);
      searchFound = true;
    }
  }
  
  if (searchFound) {
    await delay(500);
    await page.keyboard.type('港車北上', { delay: 100 });
    await delay(800);
    await page.keyboard.press('Enter');
    console.log('[2] 已輸入並按 Enter');
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
    await delay(5000);
  } else {
    console.log('[2] 未找到搜索框，嘗試直接打開搜索 URL...');
    await page.goto('https://www.facebook.com/search/groups?q=%E6%B8%AF%E8%BB%8A%E5%8C%97%E4%B8%8A&epa=_FILTER&filter=groups', 
      { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(5000);
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
