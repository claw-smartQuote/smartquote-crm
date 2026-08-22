/**
 * Facebook 自動發文 - 測試腳本 v5.0
 * puppeteer-extra + stealth + 延遲導航策略
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

const CONFIG = {
  fbEmail: '萊to@smartquote.cn',
  fbPassword: 'Pin4fb123',
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
  console.log(' Facebook 自動發文測試 - v5.0 Stealth+延遲');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 啟動瀏覽器
    console.log('[1/6] 啟動 Stealth 瀏覽器...');
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

    // 2. 創建 page（直接使用 default context）
    console.log('[2/6] 創建頁面...');
    const page = await browser.newPage();

    // 3. 登入
    console.log('[3/6] 導航到 Facebook...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
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
        // 延遲導航（避免被FB偵測）
        console.log('等待後導航...');
        await humanDelay(2000, 4000);
        
        console.log('導航到群組...');
        await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'networkidle2',
          timeout: 120000
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

        // 打開發文框
        console.log('打開發文框...');
        
        // 嘗試點擊各種選擇器
        const selectors = [
          ['button', '寫點內容'],
          ['div[role="button"]', '建立'],
          ['div[aria-label*="建立"]', null],
          ['div[aria-label*="寫"]', null],
          ['span', '建立帖子'],
        ];

        let clicked = false;
        for (const [tag, text] of selectors) {
          if (clicked) break;
          try {
            if (text) {
              const el = await page.$(`${tag}:has-text("${text}")`);
              if (el && await el.isVisible()) {
                await el.click();
                console.log(`點擊: ${tag}:has-text("${text}")`);
                clicked = true;
              }
            } else {
              const el = await page.$(tag);
              if (el && await el.isVisible()) {
                await el.click();
                console.log(`點擊: ${tag}`);
                clicked = true;
              }
            }
          } catch (e) {}
        }

        if (!clicked) {
          await page.mouse.click(700, 300);
          console.log('座標點擊');
        }
        
        await humanDelay(2000, 3500);

        // 找可編輯區域
        let editableDiv = await page.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const all = await page.$$('div[contenteditable="true"]');
          console.log(`找到 ${all.length} 個元素`);
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
          ['button[aria-label*="發"]', null],
          ['button[type="submit"]', null],
        ];

        for (const [tag, text] of pubSelectors) {
          try {
            let el;
            if (text) {
              el = await page.$(`${tag}:has-text("${text}")`);
            } else {
              el = await page.$(tag);
            }
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`發佈: ${tag}${text ? `:has-text("${text}")` : ''}`);
              break;
            }
          } catch (e) {}
        }
        
        await humanDelay(4000, 6000);

        // 截圖
        await page.screenshot({ path: `/tmp/v5_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/v5_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁
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
        await page.screenshot({ path: `/tmp/v5_error_${i}.png` }).catch(() => {});
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
