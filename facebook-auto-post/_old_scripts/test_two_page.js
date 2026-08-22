/**
 * Facebook 自動發文 - 測試腳本 v7.0
 * 雙頁面策略：頁面1登入 → 頁面2發文
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
  console.log(' Facebook 自動發文測試 - v7.0 雙頁面');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 啟動瀏覽器
    console.log('[1/7] 啟動瀏覽器...');
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: [
        '--disable-bromium-compositor',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
      ]
    });

    // 2. 創建兩個 context（獨立的 cookie 存儲）
    console.log('[2/7] 創建瀏覽上下文...');
    const context1 = await browser.createBrowserContext(); // 登入用
    const context2 = await browser.createBrowserContext(); // 發文用

    // 3. 頁面1：登入 Facebook
    console.log('[3/7] 頁面1：打開 Facebook 登入頁...');
    const loginPage = await context1.newPage();
    await loginPage.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${loginPage.url()}`);

    if (loginPage.url().includes('login')) {
      console.log('\n⚠️ 頁面1：請在瀏覽器中完成登入...');
      console.log('   登入後系統會自動繼續\n');
      await loginPage.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
    }
    console.log('✅ 頁面1：登入成功！');

    // 等待用戶確認
    console.log('\n===========================================');
    console.log(' 請確認：頁面1 已在 Facebook 主頁');
    console.log(' 按 Enter 繼續（或等待 10 秒）...');
    console.log('===========================================\n');
    
    // 等待用戶確認，或直接繼續
    await new Promise(r => setTimeout(r, 10000));

    // 4. 頁面2：用於發文
    console.log('[4/7] 頁面2：用於發文...');
    const postPage = await context2.newPage();

    // 5. 讓頁面2也訪問 Facebook（嘗試共享 session cookie）
    console.log('[5/7] 頁面2：導航到 Facebook...');
    await postPage.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${postPage.url()}`);

    if (postPage.url().includes('login')) {
      console.log('⚠️ 頁面2 session 未生效，將使用頁面1 的方式\n');
    } else {
      console.log('✅ 頁面2 已登入\n');
    }

    // 6. 測試發文
    console.log('[6/7] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 從頁面2導航
        console.log('頁面2：導航到群組...');
        await postPage.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'networkidle2',
          timeout: 120000
        });
        console.log(`URL: ${postPage.url().substring(0, 60)}...`);
        await humanDelay(3000, 5000);

        if (postPage.url().includes('login')) {
          console.log('❌ 頁面2 session 失效！');
          
          // 嘗試從頁面1複製 cookies
          console.log('嘗試從頁面1獲取 session...');
          const cookies = await context1.cookies('https://www.facebook.com');
          if (cookies.length > 0) {
            await context2.addCookies(cookies);
            console.log('已添加 cookies，重新導航...');
            await postPage.goto(`https://www.facebook.com/groups/${group.id}`, {
              waitUntil: 'networkidle2',
              timeout: 120000
            });
            console.log(`URL: ${postPage.url().substring(0, 60)}...`);
            await humanDelay(3000, 5000);
          }
          
          if (postPage.url().includes('login')) {
            console.log('❌ 仍然失效，跳過此群組');
            continue;
          }
        }

        // 滾動
        console.log('滾動...');
        await postPage.evaluate(() => window.scrollBy(0, 300));
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
              ? await postPage.$(`${tag}:has-text("${text}")`)
              : await postPage.$(tag);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`點擊: ${tag}${text ? `:has-text("${text}")` : ''}`);
              clicked = true;
            }
          } catch (e) {}
        }

        if (!clicked) {
          await postPage.mouse.click(700, 350);
          console.log('座標點擊');
        }
        
        await humanDelay(2000, 3500);

        // 找可編輯區域
        let editableDiv = await postPage.$('div[contenteditable="true"]');
        if (!editableDiv) {
          const all = await postPage.$$('div[contenteditable="true"]');
          if (all.length > 0) editableDiv = all[0];
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await postPage.screenshot({ path: `/tmp/v7_no_editor_${i}.png` });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 輸入
        await editableDiv.click();
        await humanDelay(500, 800);
        console.log('輸入內容...');
        const aiText = await getAIText();
        const content = await getTemplate(aiText);
        await postPage.keyboard.type(content, { delay: 20 });
        console.log(`已輸入 ${content.length} 字`);
        await humanDelay(800, 1500);

        // 圖片
        const imagePath = await getRandomImage();
        const fileInput = await postPage.$('input[type="file"]');
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
              ? await postPage.$(`${tag}:has-text("${text}")`)
              : await postPage.$(tag);
            if (el && await el.isVisible()) {
              await el.click();
              console.log(`發佈: ${tag}${text ? `:has-text("${text}")` : ''}`);
              break;
            }
          } catch (e) {}
        }
        
        await humanDelay(4000, 6000);

        // 截圖
        await postPage.screenshot({ path: `/tmp/v7_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/v7_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回主頁
        console.log('返回主頁...');
        await postPage.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 60000 });
        await humanDelay(2000, 3000);

        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await postPage.screenshot({ path: `/tmp/v7_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[7/7] ✅ 完成\n');
    console.log('兩個瀏覽器頁面都保持開啟，請手動關閉\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
