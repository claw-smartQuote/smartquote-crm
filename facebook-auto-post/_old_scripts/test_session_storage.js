/**
 * Facebook 自動發文 - 測試腳本 v3.3
 * 使用 storageState 持久化登入狀態
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  fbEmail: '萊to@smartquote.cn',
  fbPassword: 'Pin4fb123',
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups.slice(0, 5),
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  storageStateFile: './fb_storage_state.json',
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

// 添加隱形腳本
async function addStealthScripts(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = window.chrome || {};
    window.navigator.permissions = { query: () => Promise.resolve({ state: 'prompt' }) };
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3], configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-HK', 'zh-TW', 'zh', 'en'], configurable: true });
  });
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文測試 - v3.3 storageState');
  console.log('===========================================\n');

  let browser = null;
  const storageStateExists = fs.existsSync(CONFIG.storageStateFile);

  try {
    // 1. 如果沒有storageState，先登入並保存
    if (!storageStateExists) {
      console.log('[1/6] 首次運行：需要登入並保存狀態...\n');
      
      browser = await chromium.launch({
        headless: false,
        args: ['--disable-bromium-compositor', '--disable-dev-shm-usage', '--no-sandbox']
      });

      const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        locale: 'zh-HK',
      });

      const page = await context.newPage();
      await addStealthScripts(page);

      console.log('打開 Facebook 登入頁...');
      await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000); // 額外等待

      // 等待用戶登入
      const emailInput = await page.$('input#email');
      if (emailInput) {
        console.log('\n請在瀏覽器中手動登入...\n');
        await page.waitForFunction(() => {
          return !window.location.href.includes('login') && 
                 document.body.textContent.length > 1000;
        }, { timeout: 0 });
        console.log('✅ 登入成功！\n');
      }

      // 保存狀態
      console.log('[2/6] 保存登入狀態...');
      const storageState = await context.storageState();
      fs.writeFileSync(CONFIG.storageStateFile, JSON.stringify(storageState));
      console.log(`已保存 ${storageState.cookies.length} 個Cookies 和 localStorage`);
      console.log(`狀態文件: ${CONFIG.storageStateFile}\n`);

      await browser.close();
      console.log('請重新運行此腳本使用保存的狀態\n');
      return;
    }

    // 2. 有storageState，直接使用
    console.log('[2/6] 載入保存的登入狀態...');
    const storageState = JSON.parse(fs.readFileSync(CONFIG.storageStateFile, 'utf8'));
    console.log(`已載入 ${storageState.cookies.length} 個Cookies`);

    // 3. 創建瀏覽器（使用保存的狀態）
    console.log('[3/6] 啟動瀏覽器...');
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-bromium-compositor', '--disable-dev-shm-usage', '--no-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'zh-HK',
      storageState: CONFIG.storageStateFile, // 使用保存的狀態！
    });

    // 4. 測試發文
    console.log('[4/6] 開始發文測試...\n');
    console.log('注意：使用同一個頁面導航發文（避免新分頁被FB攔截）\n');

    const page = await context.newPage();
    await addStealthScripts(page);

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

        // 檢查登入狀態
        if (page.url().includes('login')) {
          console.log('❌ Session失效，請刪除 fb_storage_state.json 重新登入');
          break;
        }

        // 等待頁面穩定
        await page.waitForTimeout(3000);

        // 滾動
        console.log('模擬瀏覽...');
        await AntiBot.randomScrolling(page);

        // 打開發文框
        console.log('打開發文框...');
        
        // 多種策略
        const selectors = [
          'button:has-text("寫點內容")',
          'div[role="button"]:has-text("寫")',
          'div[aria-label*="建立"]',
          'div[role="composer"]',
        ];

        for (const sel of selectors) {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            await el.click();
            console.log(`使用: ${sel}`);
            break;
          }
        }

        await page.waitForTimeout(2500);

        // 找可編輯區域
        let editableDiv = await page.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const allEditables = await page.$$('div[contenteditable="true"]');
          if (allEditables.length > 0) {
            editableDiv = allEditables[0];
            console.log('使用替代可編輯div');
          }
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await page.screenshot({ path: `/tmp/v3_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 點擊並輸入
        await editableDiv.click();
        await page.waitForTimeout(500);

        console.log('輸入內容...');
        const aiText = await getAIText();
        const content = await getTemplate(aiText);
        await page.keyboard.type(content, { delay: 25 });
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
          const btn = await page.$(sel);
          if (btn && await btn.isVisible()) {
            await btn.click();
            console.log(`使用: ${sel}`);
            break;
          }
        }

        await page.waitForTimeout(4000);

        // 截圖
        await page.screenshot({ 
          path: `/tmp/v3_result_${i}_${group.id.substring(0, 8)}.png` 
        });
        console.log(`截圖: /tmp/v3_result_${i}_${group.id.substring(0, 8)}.png`);

        // 間隔
        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/v3_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[5/6] 瀏覽器保持開啟\n');
    console.log('[6/6] Session狀態已保存，下次可直接使用\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
