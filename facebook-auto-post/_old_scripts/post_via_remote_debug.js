/**
 * Facebook 自動發文 - 通過 Remote Debug 連接
 * 前提：Chrome 已在 start_chrome_for_posting.sh 啟動
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups.slice(0, 5),
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
};

const DEBUG_PORT = 9222;

async function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

async function getAIText() {
  const today = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;
  const dates = [dateStr];
  const weather = ['路面濕滑，請注意車距，減速慢行。', '氣溫上升，長途駕駛請注意防曬和定時休息。', '晚間駕駛請開啟車燈，確保安全。'];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dates[Math.floor(Math.random() * dates.length)]} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
}

async function getTemplate(aiText) {
  return `【${aiText}】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 醫保外藥用險
✅ 12次道路救援（拖車、送油、換胎）
✅ 廣東話/國語雙語服務
✅ 免費代辦ETC
全港最平，歡迎 WhatsApp / Wechat 查詢👉🏻
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`;
}

async function humanDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文 - Remote Debug 版');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 連接到 Chrome
    console.log('[1/5] 連接到 Chrome...');
    
    const wsUrl = await (async () => {
      const http = require('http');
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data).webSocketDebuggerUrl);
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
    })();

    console.log(`WebSocket: ${wsUrl}`);

    browser = await chromium.connect({
      browserWSEndpoint: wsUrl,
      ignoreHTTPSErrors: true,
    });

    console.log('✅ 已連接到 Chrome\n');

    // 2. 獲取或創建頁面
    console.log('[2/5] 準備頁面...');
    const pages = await browser.pages();
    let page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // 如果是空白頁，導航到 Facebook
    if (page.url() === 'about:blank' || !page.url().includes('facebook')) {
      await page.goto('https://www.facebook.com', { timeout: 60000 });
      await humanDelay(3000, 5000);
    }
    
    console.log(`當前 URL: ${page.url()}\n`);

    // 3. 檢查登入狀態
    if (page.url().includes('login')) {
      console.log('❌ 請先在 Chrome 中登入 Facebook！');
      console.log('完成後再運行此腳本\n');
      process.exit(1);
    }
    console.log('✅ 已登入\n');

    // 4. 開始發文
    console.log('[3/5] 開始發文...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航
        console.log('導航到群組...');
        await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          timeout: 60000
        });
        await humanDelay(4000, 6000);
        
        const finalUrl = page.url();
        console.log(`URL: ${finalUrl.substring(0, 60)}...`);

        if (finalUrl.includes('login')) {
          console.log('❌ Session 失效！請重新登入');
          break;
        }

        // 滾動
        await page.evaluate(() => window.scrollBy(0, 300));
        await humanDelay(800, 1500);

        // 找發文框
        console.log('找發文框...');
        let clicked = false;
        
        const selectors = [
          'button:has-text("寫點內容")',
          'button:has-text("建立帖子")',
          'div[role="button"]:has-text("建立")',
          'div[aria-label*="建立"]',
        ];

        for (const sel of selectors) {
          try {
            const el = await page.$(sel);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`點擊: ${sel}`);
              clicked = true;
              break;
            }
          } catch (e) {}
        }

        if (!clicked) {
          // 嘗試座標
          await page.mouse.click(650, 280);
          console.log('座標點擊');
        }
        
        await humanDelay(2000, 3500);

        // 找輸入框
        let editable = await page.$('div[contenteditable="true"]');
        if (!editable) {
          const all = await page.$$('div[contenteditable="true"]');
          if (all.length > 0) editable = all[0];
        }

        if (!editable) {
          console.log('❌ 找不到輸入框');
          await page.screenshot({ path: `/tmp/fb_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到輸入框');

        // 輸入
        await editable.click();
        await humanDelay(500, 800);
        console.log('輸入內容...');
        const content = getTemplate(getAIText());
        await page.keyboard.type(content, { delay: 15 });
        console.log(`已輸入 ${content.length} 字`);
        await humanDelay(800, 1500);

        // 圖片
        const imagePath = await getRandomImage();
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          console.log('上傳圖片...');
          await fileInput.setInputFiles(imagePath);
          await humanDelay(4000, 7000);
        }

        // 發佈
        console.log('點擊發佈...');
        const pubSelectors = ['button:has-text("發佈")', 'button:has-text("分享")', 'button:has-text("Post")'];
        
        for (const sel of pubSelectors) {
          try {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.click();
              console.log(`發佈: ${sel}`);
              break;
            }
          } catch (e) {}
        }
        
        await humanDelay(4000, 6000);

        // 截圖
        await page.screenshot({ path: `/tmp/fb_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/fb_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁
        await page.goto('https://www.facebook.com', { timeout: 30000 });
        await humanDelay(2000, 3000);

        if (i < CONFIG.groups.length - 1) {
          const wait = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${wait/1000} 秒...\n`);
          await new Promise(r => setTimeout(r, wait));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/fb_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 完成 ==========\n');
    console.log('[4/5] ✅ 發文完成\n');
    console.log('[5/5] 瀏覽器保持開啟，隨時可以再次運行\n');

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.disconnect().catch(() => {});
  }
}

main();
