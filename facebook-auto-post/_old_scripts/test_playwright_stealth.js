/**
 * Facebook 自動發文 - 測試腳本 v4.2
 * Playwright + Stealth + 嘗試多個發文選擇器
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  fbEmail: '萊to@smartquote.cn',
  fbPassword: 'Pin4fb123',
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups.slice(0, 5),
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
};

async function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

async function getAIText() {
  return `📅 2026年4月15日 星期三 長途駕駛請注意防曬和定時休息。祝你旅途平安！`;
}

async function getTemplate(aiText) {
  return `【${aiText}】
🚗 節省汽車保險｜ 保險報價｜私家車・電動車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 12次道路救援
WhatsApp 查詢📱 https://api.whatsapp.com/send?phone=85221101144
#港車北上 #汽車保險`;
}

async function humanDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

async function clickElement(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.click();
        return sel;
      }
    } catch (e) {}
  }
  return null;
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文測試 - v4.2 Playwright+Stealth');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 啟動瀏覽器
    console.log('[1/6] 啟動瀏覽器...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-bromium-compositor',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
      ]
    });

    // 2. 創建 context
    console.log('[2/6] 創建瀏覽上下文...');
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'zh-HK',
      timezoneId: 'Asia/Hong_Kong',
    });

    // 添加隱形腳本
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = window.chrome || {};
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3], configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-HK', 'zh-TW', 'zh', 'en'], configurable: true });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    });

    const page = await context.newPage();

    // 3. 登入
    console.log('[3/6] 導航到 Facebook...');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n需要登入！請在瀏覽器中完成登入...\n');
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
      console.log('✅ 登入成功！\n');
    } else {
      console.log('✅ 已登入\n');
    }

    // 4. 測試發文
    console.log('[4/6] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航
        console.log('導航到群組...');
        await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        console.log(`URL: ${page.url().substring(0, 60)}...`);
        await humanDelay(3000, 5000);

        if (page.url().includes('login')) {
          console.log('❌ Session失效！');
          break;
        }

        // 滾動
        console.log('滾動...');
        for (let s = 0; s < 3; s++) {
          await page.evaluate(() => window.scrollBy(0, 300));
          await humanDelay(500, 1000);
        }

        // 打開發文框 - 嘗試更多選擇器
        console.log('打開發文框...');
        
        // 首先嘗試直接點擊頁面中央（很多群組的發文框在頂部）
        await page.mouse.click(700, 300);
        await humanDelay(1500, 2500);

        // 嘗試各種可能的选择器
        const postSelectors = [
          'button:has-text("寫點內容")',
          'button:has-text("建立帖子")',
          'button:has-text("建立")',
          'div[aria-label*="寫"]',
          'div[aria-label*="建立"]',
          'div[aria-label*="Create"]',
          'div[aria-label*="Write"]',
          'div[role="button"][tabindex="0"]',
          'div[role="composer"]',
          'span:has-text("建立帖子")',
          'span:has-text("寫點內容")',
        ];

        let clicked = await clickElement(page, postSelectors);
        if (clicked) {
          console.log(`點擊: ${clicked}`);
        } else {
          console.log('使用座標點擊');
        }
        
        await humanDelay(2000, 3500);

        // 找可編輯區域
        let editableDiv = await page.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const all = await page.$$('div[contenteditable="true"]');
          console.log(`找到 ${all.length} 個 contenteditable 元素`);
          if (all.length > 0) editableDiv = all[0];
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await page.screenshot({ path: `/tmp/pw_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 點擊並輸入
        await editableDiv.click();
        await humanDelay(500, 800);

        console.log('輸入內容...');
        const aiText = await getAIText();
        const content = await getTemplate(aiText);
        await page.keyboard.type(content, { delay: 20 });
        console.log(`已輸入 ${content.length} 字`);
        await humanDelay(800, 1500);

        // 圖片
        const imagePath = await getRandomImage();
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          console.log('上傳圖片...');
          await fileInput.setInputFiles(imagePath);
          await humanDelay(5000, 8000);
        }

        // 發佈
        console.log('點擊發佈...');
        const pubSelectors = [
          'button:has-text("發佈")',
          'button:has-text("分享")',
          'button:has-text("Post")',
          'button[aria-label*="發"]',
          'button[type="submit"]',
          'div[role="button"]:has-text("發")',
        ];

        let pubClicked = await clickElement(page, pubSelectors);
        if (pubClicked) {
          console.log(`發佈: ${pubClicked}`);
        }
        
        await humanDelay(4000, 6000);

        // 截圖
        await page.screenshot({ path: `/tmp/pw_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/pw_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁刷新 session
        console.log('返回主頁...');
        await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await humanDelay(2000, 3000);

        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/pw_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[5/6] ✅ 測試完成\n');
    console.log('[6/6] 瀏覽器保持開啟，請手動關閉\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
