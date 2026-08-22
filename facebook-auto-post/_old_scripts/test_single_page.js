/**
 * Facebook 自動發文 - 測試腳本 v3.5
 * 單一分頁導航策略（避免被FB偵測）
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
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

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文測試 - v3.5 單一分頁');
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
        '--disable-blink-features=AutomationControlled',
      ]
    });

    // 2. 創建 context 和 page
    console.log('[2/6] 創建瀏覽上下文...');
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'zh-HK',
    });

    const page = await context.newPage();
    
    // 隱形腳本
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = window.chrome || {};
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3], configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-HK', 'zh-TW', 'zh', 'en'], configurable: true });
    });

    // 3. 登入
    console.log('[3/6] 導航到 Facebook...');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n需要登入！請在瀏覽器中完成登入...\n');
      await page.waitForFunction(() => {
        return !window.location.href.includes('login');
      }, { timeout: 0 });
      console.log('✅ 登入成功！\n');
    } else {
      console.log('✅ 已登入\n');
    }

    // 4. 測試發文（在同一分頁內導航）
    console.log('[4/6] 開始發文測試...\n');
    console.log('========== 開始發文測試 ==========\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航到群組
        console.log('導航到群組...');
        await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        console.log(`URL: ${page.url().substring(0, 60)}...`);

        if (page.url().includes('login')) {
          console.log('❌ Session失效！');
          break;
        }

        await page.waitForTimeout(3000);

        // 滾動模擬瀏覽
        console.log('模擬瀏覽...');
        await AntiBot.randomScrolling(page);

        // 打開發文框
        console.log('打開發文框...');
        let clicked = false;
        
        const clickSelectors = [
          'button:has-text("寫點內容")',
          'div[role="button"]:has-text("寫")',
          'div[aria-label*="建立"]',
          'div[role="composer"]',
        ];
        
        for (const sel of clickSelectors) {
          try {
            const el = await page.$(sel);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`使用: ${sel}`);
              clicked = true;
              break;
            }
          } catch(e) {}
        }

        if (!clicked) {
          await page.mouse.click(700, 350);
          console.log('使用座標點擊');
        }

        await page.waitForTimeout(2500);

        // 找可編輯區域
        let editableDiv = await page.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const all = await page.$$('div[contenteditable="true"]');
          if (all.length > 0) editableDiv = all[0];
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await page.screenshot({ path: `/tmp/v5_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 點擊並輸入
        await editableDiv.click();
        await page.waitForTimeout(500);

        console.log('輸入內容...');
        const aiText = await getAIText();
        const content = await getTemplate(aiText);
        await page.keyboard.type(content, { delay: 20 });
        console.log(`已輸入 ${content.length} 字`);

        await page.waitForTimeout(1000);

        // 上傳圖片
        const imagePath = await getRandomImage();
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          console.log('上傳圖片...');
          await fileInput.setInputFiles(imagePath);
          await page.waitForTimeout(5000);
        }

        // 發佈
        console.log('點擊發佈...');
        const pubSelectors = ['button:has-text("發佈")', 'button:has-text("分享")'];
        for (const sel of pubSelectors) {
          try {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.click();
              console.log(`使用: ${sel}`);
              break;
            }
          } catch(e) {}
        }

        await page.waitForTimeout(4000);

        // 截圖
        await page.screenshot({ 
          path: `/tmp/v5_result_${i}_${group.id.substring(0, 8)}.png` 
        });
        console.log(`截圖: /tmp/v5_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁（保持登入狀態顯示）
        console.log('返回主頁...');
        await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // 間隔
        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/v5_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[5/6] ✅ 單一分頁導航完成！\n');
    console.log('[6/6] 瀏覽器保持開啟，請手動關閉\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
