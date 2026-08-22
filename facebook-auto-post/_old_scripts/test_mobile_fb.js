/**
 * Facebook 自動發文 - 測試腳本 v6.0
 * 嘗試移動版 Facebook（m.facebook.com）
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
WhatsApp 查詢📱 https://api.whatsapp.com/send?phone=85221101144
#港車北上 #汽車保險`;
}

async function humanDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文測試 - v6.0 移動版');
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
      ]
    });

    const page = await browser.newPage();

    // 設置移動端視角
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

    // 2. 登入（移動版）
    console.log('[2/6] 導航到移動版 Facebook...');
    await page.goto('https://m.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay(3000, 5000);
    console.log(`URL: ${page.url()}`);

    if (page.url().includes('login')) {
      console.log('\n需要登入！請在瀏覽器中完成登入...\n');
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });
      console.log('✅ 登入成功！\n');
    } else {
      console.log('✅ 已登入\n');
    }

    // 3. 測試發文
    console.log('[3/6] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航到群組（移動版）
        console.log('導航到群組...');
        await page.goto(`https://m.facebook.com/groups/${group.id}`, {
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
        await page.evaluate(() => window.scrollBy(0, 300));
        await humanDelay(1000, 2000);

        // 找發文按鈕（移動版）
        console.log('找發文按鈕...');
        const postBtn = await page.$('a[href*="/composer/"], a[href*="/write/"], div[data-ss]");
        if (postBtn) {
          await postBtn.click();
          console.log('點擊發文');
        } else {
          // 嘗試其他選擇器
          const alt = await page.$('a:has-text("發佈"), a:has-text("評論"), a:has-text("建立")');
          if (alt) {
            await alt.click();
            console.log('點擊替代按鈕');
          } else {
            console.log('未找到發文按鈕');
          }
        }

        await humanDelay(2000, 3500);

        // 截圖
        await page.screenshot({ path: `/tmp/mobile_result_${i}_${group.id.substring(0, 8)}.png` });
        console.log(`截圖: /tmp/mobile_result_${i}_${group.id.substring(0, 8)}.png`);

        // 返回
        console.log('返回主頁...');
        await page.goto('https://m.facebook.com', { waitUntil: 'networkidle2', timeout: 60000 });
        await humanDelay(2000, 3000);

        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/mobile_error_${i}.png` }).catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[4/6] ✅ 移動版測試完成\n');
    console.log('[5/6] 請查看截圖了解結果\n');
    console.log('[6/6] 瀏覽器保持開啟\n');

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
