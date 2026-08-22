/**
 * Facebook 測試發文腳本 v2
 */

const { chromium } = require('playwright');
const fs = require('fs');

const TEST_MESSAGE = `【測試帖子】
🚗 港車北上保險測試
✅ 交強險 + 商業第三者責任險
🔥 全套低至 ¥1469 起
WhatsApp: https://api.whatsapp.com/send?phone=85221101144
#港車北上 #汽車保險`;

(async () => {
  console.log('🚀 測試發文開始...\n');
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: './fb_session_logged_in.json'
  });

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  if (await page.$('input[name="email"]')) {
    console.log('❌ 需要登入！');
    await browser.close();
    return;
  }
  console.log('✅ 已登入\n');
  
  // 從 target_groups_clean.json 隨機選一個群組
  const groupsData = JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8'));
  const testGroup = groupsData.groups[Math.floor(Math.random() * 10)]; // 前10個
  console.log(`📬 測試群組: ${testGroup.name} (${testGroup.id})`);
  
  await page.goto(`https://www.facebook.com/groups/${testGroup.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: './test_group_page.png', fullPage: true });
  console.log('📸 截圖: test_group_page.png');
  
  // 使用 JS 點擊方式找發文框
  const result = await page.evaluate(async () => {
    // 嘗試點擊「發佈動態」或類似按鈕
    const buttons = Array.from(document.querySelectorAll('div[role="button"], span'));
    let clicked = false;
    
    for (const btn of buttons) {
      const text = btn.innerText?.trim();
      if (text && (text.includes('發佈') || text.includes('Share') || text.includes('分享') || text.includes('動態'))) {
        btn.click();
        clicked = true;
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // 現在找發文框
    const selectors = [
      'div[contenteditable="true"][role="textarea"]',
      'textarea[name="message"]',
      '[data-testid="fb-texty-input"]',
      'div[aria-label*="發佈"]',
      'div[contenteditable="true"]'
    ];
    
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        return { found: true, selector: sel, text: el.innerText || '' };
      }
    }
    return { found: false, clicked };
  });
  
  console.log(`\n📊 結果:`, result);
  
  if (result.found) {
    console.log('\n✍️  輸入內容...');
    await page.keyboard.type(TEST_MESSAGE, { delay: 20 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: './test_after_type.png' });
    console.log('📸 截圖: test_after_type.png');
    
    // 找發佈按鈕並點擊
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
      for (const btn of buttons) {
        const text = btn.innerText?.trim();
        if (text && (text.includes('發佈') || text === 'Post' || text.includes('分享'))) {
          btn.click();
          break;
        }
      }
    });
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: './test_after_post.png' });
    console.log('📸 截圖: test_after_post.png');
    console.log('\n✅ 應該已發佈！');
  } else {
    console.log('\n⚠️ 未找到發文框，請查看截圖');
    console.log('可能原因：');
    console.log('  1. 該群組需要審批才能發文');
    console.log('  2. 群組已關閉發文功能');
    console.log('  3. 需要先加入群組');
  }
  
  console.log('\n👋 瀏覽器保持開啟 15 秒...');
  await new Promise(r => setTimeout(r, 15000));
  await browser.close();
  console.log('✅ 完成！');
})();
