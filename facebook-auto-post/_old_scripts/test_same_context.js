/**
 * Facebook 自動發文 - 測試腳本 v3.4
 * 關鍵：所有分頁必須在同一個 Browser Context 內創建
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
  console.log(' Facebook 自動發文測試 - v3.4 同一Context');
  console.log('===========================================\n');

  let browser = null;
  let context = null;
  let loginPage = null;

  try {
    // 1. 啟動瀏覽器（只啟動一次）
    console.log('[1/7] 啟動瀏覽器（請保留此窗口！）...');
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

    // 2. 創建單一 Context（所有分頁共享！）
    console.log('[2/7] 創建瀏覽上下文...');
    context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'zh-HK',
    });

    // 3. 在此 Context 內創建第一個分頁（登入用）
    console.log('[3/7] 開啟登入分頁...');
    loginPage = await context.newPage();
    
    // 添加隱形腳本
    await loginPage.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = window.chrome || {};
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3], configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-HK', 'zh-TW', 'zh', 'en'], configurable: true });
    });

    console.log('[4/7] 導航到 Facebook...');
    await loginPage.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginPage.waitForTimeout(3000);
    console.log(`URL: ${loginPage.url()}`);

    // 檢查是否需要登入
    const url = loginPage.url();
    if (url.includes('login')) {
      console.log('\n需要登入！請在瀏覽器中：');
      console.log('  1. 點擊「使用電子郵件登入」');
      console.log('  2. 輸入: 萊to@smartquote.cn');
      console.log('  3. 輸入密碼: Pin4fb123');
      console.log('  4. 完成登入後回來\n');
      
      // 等待用戶手動登入
      await loginPage.waitForFunction(() => {
        return !window.location.href.includes('login') && 
               document.body.textContent.length > 1000;
      }, { timeout: 0 });
      
      console.log('✅ 登入成功！\n');
    } else {
      console.log('✅ 已登入\n');
    }

    // 4. 登入完成，現在在「同一 Context」內創建新分頁發文
    console.log('[5/7] 在同一 Context 內創建發文分頁...\n');
    console.log('重要：請保留第一個分頁（登入狀態）！\n');

    // 創建發文分頁（與登入分頁共享同一 Context，所以共享 cookies！）
    const postPage = await context.newPage();
    
    // 添加隱形腳本到新分頁
    await postPage.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = window.chrome || {};
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3], configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-HK', 'zh-TW', 'zh', 'en'], configurable: true });
    });

    console.log('========== 開始發文測試 ==========\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航（在同一分頁內）
        console.log('導航到群組...');
        await postPage.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        console.log(`URL: ${postPage.url().substring(0, 60)}...`);

        // 檢查登入狀態
        if (postPage.url().includes('login')) {
          console.log('❌ Session失效！請檢查第一個分頁是否仍在登入狀態');
          break;
        }

        await postPage.waitForTimeout(3000);

        // 滾動
        console.log('模擬瀏覽...');
        await AntiBot.randomScrolling(postPage);

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
            const el = await postPage.$(sel);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`使用: ${sel}`);
              clicked = true;
              break;
            }
          } catch(e) {}
        }

        if (!clicked) {
          // 最後手段：座標點擊
          await postPage.mouse.click(700, 350);
          console.log('使用座標點擊');
        }

        await postPage.waitForTimeout(2500);

        // 找可編輯區域
        let editableDiv = await postPage.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const allEditables = await postPage.$$('div[contenteditable="true"]');
          if (allEditables.length > 0) editableDiv = allEditables[0];
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await postPage.screenshot({ path: `/tmp/v4_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 點擊並輸入
        await editableDiv.click();
        await postPage.waitForTimeout(500);

        console.log('輸入內容...');
        const aiText = await getAIText();
        const content = await getTemplate(aiText);
        await postPage.keyboard.type(content, { delay: 20 });
        console.log(`已輸入 ${content.length} 字`);

        await postPage.waitForTimeout(1000);

        // 上傳圖片
        const imagePath = await getRandomImage();
        const fileInput = await postPage.$('input[type="file"]');
        if (fileInput) {
          console.log('上傳圖片...');
          await fileInput.setInputFiles(imagePath);
          await postPage.waitForTimeout(5000);
        }

        // 發佈
        console.log('點擊發佈...');
        const pubSelectors = ['button:has-text("發佈")', 'button:has-text("分享")'];
        for (const sel of pubSelectors) {
          try {
            const btn = await postPage.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.click();
              console.log(`使用: ${sel}`);
              break;
            }
          } catch(e) {}
        }

        await postPage.waitForTimeout(4000);

        // 截圖
        await postPage.screenshot({ 
          path: `/tmp/v4_result_${i}_${group.id.substring(0, 8)}.png` 
        });
        console.log(`截圖: /tmp/v4_result_${i}_${group.id.substring(0, 8)}.png`);

        // 間隔
        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await postPage.screenshot({ path: `/tmp/v4_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[6/7] ✅ Session共享成功！\n');
    console.log('[7/7] 兩個分頁都在同一瀏覽器中，請手動關閉\n');

    // 保持進程
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
