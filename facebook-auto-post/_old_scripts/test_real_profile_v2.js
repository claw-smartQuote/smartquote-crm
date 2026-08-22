/**
 * Facebook 自動發文 - v8.0
 * 使用真實 Chrome Profile（萊to@smartquote.cn 已登入）
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
  console.log(' Facebook 自動發文測試 - v8.0 真實Profile');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 使用真實 Chrome Profile
    console.log('[1/6] 啟動瀏覽器（使用真實 Profile）...');
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: '/Users/claw/Library/Application Support/Google/Chrome',  // 真實用戶數據
      args: [
        '--disable-bromium-compositor',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
      ]
    });

    const page = await browser.newPage();

    // 2. 導航到 Facebook（應該已登入）
    console.log('[2/6] 導航到 Facebook...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n⚠️ 需要登入！請在瀏覽器中完成登入...\n');
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
    }
    console.log('✅ 已準備就緒\n');

    // 等待用戶確認
    console.log('===========================================');
    console.log(' 瀏覽器已開啟並登入 Facebook');
    console.log(' 按 Enter 繼續發文測試...');
    console.log('===========================================\n');
    
    await new Promise(r => setTimeout(r, 8000));

    // 3. 測試發文
    console.log('[3/6] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航到群組
        console.log('導航到群組...');
        await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'networkidle2',
          timeout: 120000
        });
        console.log(`URL: ${page.url().substring(0, 60)}...`);
        await humanDelay(3000, 5000);

        if (page.url().includes('login')) {
          console.log('❌ Session 失效！請檢查瀏覽器是否仍登入');
          break;
        }

        // 滾動
        console.log('滾動...');
        await page.evaluate(() => window.scrollBy(0, 300));
        await humanDelay(1000, 2000);

        // 打開發文框
        console.log('找發文框...');
        let clicked = false;
        
        const selectors = [
          ['button', '寫點內容'],
          ['button', '建立帖子'],
          ['div[role="button"]', null],
          ['div[aria-label*="建立"]', null],
          ['span', '建立帖子'],
        ];

        for (const [tag, text] of selectors) {
          if (clicked) break;
          try {
            const el = text 
              ? await page.$(`${tag}:has-text("${text}")`)
              : await page.$(tag);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`點擊: ${tag}${text ? `:has-text("${text}")` : ''}`);
              clicked = true;
            }
          } catch (e) {}
        }

        if (!clicked) {
          await page.mouse.click(700, 350);
          console.log('座標點擊');
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
          await page.screenshot({ path: `/tmp/v8_no_editor_${i}.png` });
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
        const pubSelectors = [
          ['button', '發佈'],
          ['button', '分享'],
          ['button[type="submit"]', null],
        ];

        for (const [tag, text] of pubSelectors) {
          try {
            const el = text 
              ? await page.$(`${tag}:has-text("${text}")`)
              : await page.$(tag);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`發佈: ${tag}${text ? `:has-text("${text}")` : ''}`);
              break;
            }
          } catch (e) {}
        }
        
        await humanDelay(4000, 6000);

        // 截圖
        await page.screenshot({ path: `/tmp/v8_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/v8_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁刷新
        console.log('返回主頁...');
        await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 60000 });
        await humanDelay(2000, 3000);

        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/v8_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[4/6] ✅ 完成\n');
    console.log('[5/6] 請查看截圖了解結果\n');
    console.log('[6/6] 瀏覽器保持開啟，請手動關閉\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
