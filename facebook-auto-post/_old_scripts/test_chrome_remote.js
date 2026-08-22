/**
 * Facebook 自動發文 - v9.0
 * 使用 Chrome Remote Debugging 連接到已打開的 Chrome
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const { execSync } = require('child_process');

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
  console.log(' Facebook 自動發文測試 - v9.0 Remote Debug');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 首先用 shell 腳本啟動 Chrome 並打開遠程調試
    console.log('[1/7] 啟動 Chrome 並開啟遠程調試...');
    
    // 檢查是否已有 Chrome 實例在調試端口
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if (response.ok) {
        console.log('發現已有 Chrome 實例在調試模式');
        const data = await response.json();
        console.log(`WebSocket URL: ${data.webSocketDebuggerUrl}`);
      }
    } catch (e) {
      console.log('沒有發現調試端口，嘗試啟動新的 Chrome...');
      
      // 啟動 Chrome 並開啟調試端口
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const userDataDir = '/Users/claw/Library/Application Support/Google/Chrome';
      
      // 使用 nohup 在後台啟動 Chrome
      execSync(`nohup "${chromePath}" --remote-debugging-port=9222 --user-data-dir="${userDataDir}" "https://www.facebook.com" > /tmp/chrome_debug.log 2>&1 &`, {
        detached: true,
        stdio: 'ignore'
      });
      
      console.log('Chrome 啟動中，等待 5 秒...');
      await new Promise(r => setTimeout(r, 5000));
    }

    // 2. 連接到 Chrome 調試端口
    console.log('[2/7] 連接到 Chrome...');
    
    const wsUrl = await new Promise((resolve, reject) => {
      fetch('http://127.0.0.1:9222/json/version')
        .then(r => r.json())
        .then(data => resolve(data.webSocketDebuggerUrl))
        .catch(reject);
    });

    console.log(`WebSocket: ${wsUrl}`);

    browser = await puppeteer.connect({
      browserWSEndpoint: wsUrl,
      ignoreHTTPSErrors: true,
    });

    console.log('✅ 已連接到 Chrome\n');

    // 3. 獲取現有頁面或創建新頁面
    console.log('[3/7] 獲取頁面...');
    const pages = await browser.pages();
    let page = pages.length > 0 ? pages[0] : await browser.newPage();

    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n⚠️ 需要登入！請在瀏覽器中完成登入...\n');
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
    }
    console.log('✅ 已準備就緒\n');

    // 等待確認
    console.log('===========================================');
    console.log(' Chrome 已連接並登入');
    console.log(' 等待 8 秒後開始發文測試...');
    console.log('===========================================\n');
    await new Promise(r => setTimeout(r, 8000));

    // 4. 測試發文
    console.log('[4/7] 開始發文測試...\n');

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
          console.log('❌ Session 失效！');
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
          await page.screenshot({ path: `/tmp/v9_no_editor_${i}.png` });
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
        await page.screenshot({ path: `/tmp/v9_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/v9_result_${i}_${group.id.substring(0, 8)}.png`);

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
        await page.screenshot({ path: `/tmp/v9_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[5/7] ✅ 完成\n');
    console.log('[6/7] 請查看截圖了解結果\n');
    console.log('[7/7] Chrome 保持開啟\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.disconnect().catch(() => {});
  }
}

main();
