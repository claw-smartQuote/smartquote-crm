/**
 * Facebook 自動發文 - v14.0
 * 最少限度的瀏覽器配置
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
WhatsApp 查詢📱 https://api.whatsapp.com/send?phone=85221101144
#港車北上 #汽車保險`;
}

async function humanDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文 - v14.0 乾淨啟動');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 最基本的 Chrome 啟動（不做任何特殊配置）
    console.log('[1/6] 啟動瀏覽器（最少配置）...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // 2. 訪問 Facebook
    console.log('[2/6] 訪問 Facebook...');
    await page.goto('https://www.facebook.com', { timeout: 60000 });
    await humanDelay(5000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n需要登入！');
      await page.waitForNavigation({ timeout: 0 });
    }

    console.log('\n準備就緒！等待 30 秒讓頁面穩定...\n');
    await humanDelay(30000);

    // 3. 開始發文
    console.log('[3/6] 開始發文...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 直接導航
        await page.goto(`https://www.facebook.com/groups/${group.id}`, { timeout: 60000 });
        await humanDelay(5000);
        
        console.log(`URL: ${page.url()}`);

        if (page.url().includes('login')) {
          console.log('❌ 登入失效');
          break;
        }

        // 滾動
        await page.evaluate(() => window.scrollBy(0, 300));
        await humanDelay(1000);

        // 找發文框
        const selectors = [
          'button:has-text("寫點內容")',
          'button:has-text("建立帖子")',
          'div[role="button"]',
        ];

        for (const sel of selectors) {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            await el.click();
            console.log(`點擊: ${sel}`);
            break;
          }
        }
        
        await humanDelay(2000);

        // 找輸入框
        const editable = await page.$('div[contenteditable="true"]');
        if (editable) {
          console.log('✅ 找到輸入框');
          await editable.click();
          await page.keyboard.type(getTemplate(getAIText()), { delay: 10 });
          
          // 圖片
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            await fileInput.setInputFiles(getRandomImage());
            await humanDelay(4000);
          }
          
          // 發佈
          const pubBtn = await page.$('button:has-text("發佈")');
          if (pubBtn) await pubBtn.click();
          
          await humanDelay(3000);
        }

        // 截圖
        await page.screenshot({ path: `/tmp/v14_result_${i}.png` });
        console.log(`截圖: /tmp/v14_result_${i}.png`);

        // 返回
        await page.goto('https://www.facebook.com');
        await humanDelay(3000);

        if (i < CONFIG.groups.length - 1) {
          await new Promise(r => setTimeout(r, 15000));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/v14_error_${i}.png` });
      }
    }

    console.log('\n========== 完成 ==========\n');
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close();
  }
}

main();
