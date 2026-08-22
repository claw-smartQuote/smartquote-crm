/**
 * Facebook 自動發文 - v11.0
 * 使用 JavaScript 內部導航（避免 FB 檢測）
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups.slice(0, 5),
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
};

puppeteer.use(StealthPlugin());

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

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文 - v11.0 JS導航');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 啟動瀏覽器
    console.log('[1/6] 啟動瀏覽器...');
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: [
        '--disable-bromium-compositor',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    });

    const page = await browser.newPage();

    // 2. 登入
    console.log('[2/6] 導航到 Facebook...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n⚠️ 請在瀏覽器中登入...\n');
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
    }
    console.log('✅ 已登入\n');

    // 等待用戶確認
    console.log('按 Enter 繼續（或等待 30 秒）...\n');
    await new Promise(r => setTimeout(r, 30000));

    // 3. 測試發文
    console.log('[3/6] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 使用 JavaScript 導航（而不是 page.goto）
        console.log('使用 JS 導航到群組...');
        await page.evaluate((groupId) => {
          window.location.href = `https://www.facebook.com/groups/${groupId}`;
        }, group.id);
        
        // 等待導航完成
        await page.waitForFunction(() => {
          return document.readyState === 'complete' && !window.location.href.includes('login');
        }, { timeout: 60000 });
        
        console.log(`URL: ${page.url().substring(0, 60)}...`);
        await humanDelay(3000, 5000);

        if (page.url().includes('login')) {
          console.log('❌ Session 失效！');
          break;
        }

        // 滾動
        console.log('滾動...');
        await page.evaluate(() => window.scrollBy(0, 300));
        await humanDelay(1000, 2000);

        // 打開發文框
        console.log('找發文框...');
        
        // 使用 JavaScript 點擊
        const clicked = await page.evaluate(() => {
          const selectors = [
            () => document.querySelector('button:has-text("寫點內容")'),
            () => document.querySelector('button:has-text("建立帖子")'),
            () => document.querySelector('div[role="button"]'),
            () => document.querySelector('div[aria-label*="建立"]'),
            () => document.querySelector('span:has-text("建立帖子")'),
          ];
          
          for (const selectorFn of selectors) {
            try {
              const el = selectorFn();
              if (el && el.offsetParent !== null) {
                el.click();
                return true;
              }
            } catch (e) {}
          }
          return false;
        });
        
        if (clicked) {
          console.log('✅ 點擊成功');
        } else {
          console.log('⚠️ 點擊未找到，嘗試座標點擊');
          await page.mouse.click(700, 350);
        }
        
        await humanDelay(2000, 3500);

        // 找可編輯區域
        let editableDiv = await page.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const all = await page.$$('div[contenteditable="true"]');
          if (all.length > 0) editableDiv = all[0];
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await page.screenshot({ path: `/tmp/v11_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 輸入
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
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const publishBtn = buttons.find(b => 
            b.textContent.includes('發佈') || 
            b.textContent.includes('分享') ||
            b.textContent.includes('Post')
          );
          if (publishBtn) publishBtn.click();
        });
        
        await humanDelay(4000, 6000);

        // 截圖
        await page.screenshot({ path: `/tmp/v11_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/v11_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁
        console.log('返回主頁...');
        await page.evaluate(() => {
          window.location.href = 'https://www.facebook.com';
        });
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
        await humanDelay(2000, 3000);

        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/v11_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[4/6] ✅ 完成\n');
    console.log('[5/6] 請查看截圖了解結果\n');
    console.log('[6/6] 瀏覽器保持開啟\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
