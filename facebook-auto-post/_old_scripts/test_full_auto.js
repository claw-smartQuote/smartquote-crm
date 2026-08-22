/**
 * Facebook 自動發文 - v13.0
 * 直接導航 + 處理所有情況
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
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

async function tryClickPostBox(page) {
  const selectors = [
    'button:has-text("寫點內容")',
    'button:has-text("建立帖子")',
    'button:has-text("建立")',
    'div[role="button"]:has-text("建立")',
    'div[aria-label*="建立"]',
    'div[aria-label*="寫"]',
    'span:has-text("建立帖子")',
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.click();
        console.log(`點擊: ${sel}`);
        return true;
      }
    } catch (e) {}
  }
  
  // 座標點擊（常見發文框位置）
  await page.mouse.click(650, 280);
  console.log('座標點擊: 650, 280');
  return false;
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文 - v13.0 全自動');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 啟動瀏覽器
    console.log('[1/7] 啟動瀏覽器...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-bromium-compositor',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
      ]
    });

    const page = await browser.newPage();

    // 2. 訪問 Facebook
    console.log('[2/7] 訪問 Facebook...');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(5000, 8000);
    console.log(`URL: ${page.url()}`);

    // 3. 檢查是否需要互動
    if (page.url().includes('login')) {
      console.log('\n⚠️ 需要登入！請在瀏覽器中完成登入...\n');
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
    }
    console.log('✅ 已準備就緒\n');

    // 等待用戶確認
    console.log('===========================================');
    console.log(' 準備開始自動發文');
    console.log(' 按 Enter 繼續（或等待 20 秒）...');
    console.log('===========================================\n');
    await new Promise(r => setTimeout(r, 20000));

    // 4. 開始發文
    console.log('[3/7] 開始發文...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name} (${group.id})`);

      try {
        // 導航
        console.log('導航...');
        const response = await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        const finalUrl = page.url();
        console.log(`URL: ${finalUrl.substring(0, 70)}...`);
        await humanDelay(3000, 5000);

        // 檢測是否被阻擋
        if (finalUrl.includes('login')) {
          console.log('❌ Session 失效');
          // 嘗試刷新
          await page.reload({ waitUntil: 'domcontentloaded' });
          await humanDelay(3000);
          if (page.url().includes('login')) {
            console.log('仍然失效，跳過');
            continue;
          }
        }

        if (finalUrl.includes('two_step') || finalUrl.includes('approval')) {
          console.log('⚠️ 需要驗證！請在瀏覽器中完成驗證，然後等待...');
          await page.waitForFunction(() => {
            return !window.location.href.includes('two_step') && 
                   !window.location.href.includes('approval');
          }, { timeout: 120000 });
          console.log('✅ 驗證完成');
        }

        // 滾動
        console.log('滾動...');
        await page.evaluate(() => window.scrollBy(0, 400));
        await humanDelay(1000, 2000);

        // 截圖（看看當前頁面狀態）
        await page.screenshot({ path: `/tmp/auto_${i}_before_${group.id.substring(0,8)}.png` });
        console.log(`截圖: /tmp/auto_${i}_before_${group.id.substring(0,8)}.png`);

        // 嘗試點擊發文框
        console.log('找發文框...');
        await tryClickPostBox(page);
        await humanDelay(2000, 3500);

        // 檢查是否出現可編輯區域
        let editable = await page.$('div[contenteditable="true"]');
        if (!editable) {
          const allEditable = await page.$$('div[contenteditable="true"]');
          if (allEditable.length > 0) {
            editable = allEditable[0];
            console.log('使用替代可編輯區域');
          }
        }

        if (!editable) {
          console.log('⚠️ 找不到可編輯區域，跳過此群組');
          await page.screenshot({ path: `/tmp/auto_${i}_no_editor_${group.id.substring(0,8)}.png` });
          
          // 關閉分頁
          await page.evaluate(() => { if (window.close) window.close(); });
          continue;
        }
        console.log('✅ 找到可編輯區域');

        // 輸入
        await editable.click();
        await humanDelay(500, 800);
        console.log('輸入...');
        const content = getTemplate(getAIText());
        await page.keyboard.type(content, { delay: 15 });
        console.log(`已輸入 ${content.length} 字`);
        await humanDelay(800, 1500);

        // 上傳圖片
        const imagePath = await getRandomImage();
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          console.log('上傳圖片...');
          await fileInput.setInputFiles(imagePath);
          await humanDelay(4000, 7000);
        }

        // 點擊發佈
        console.log('發佈...');
        const pubSelectors = [
          'button:has-text("發佈")',
          'button:has-text("分享")',
          'button:has-text("Post")',
          'button[type="submit"]',
        ];

        for (const sel of pubSelectors) {
          const btn = await page.$(sel);
          if (btn && await btn.isVisible()) {
            await btn.click();
            console.log(`點擊: ${sel}`);
            break;
          }
        }

        await humanDelay(4000, 6000);

        // 截圖結果
        await page.screenshot({ path: `/tmp/auto_${i}_result_${group.id.substring(0,8)}.png` });
        console.log(`結果截圖: /tmp/auto_${i}_result_${group.id.substring(0,8)}.png`);

        // 記錄
        console.log(`✅ 完成`);

        // 關閉分頁
        try {
          await page.close();
        } catch (e) {}
        
        // 間隔
        if (i < CONFIG.groups.length - 1) {
          const wait = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${wait/1000} 秒...\n`);
          await new Promise(r => setTimeout(r, wait));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/auto_${i}_error_${group.id.substring(0,8)}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 完成 ==========\n');
    console.log('[4/7] ✅ 全部完成\n');
    console.log('[5/7] 請查看截圖了解結果\n');
    console.log('[6/7] 瀏覽器保持開啟\n');
    console.log('[7/7] 手動關閉瀏覽器\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
