/**
 * Facebook 自動發文 - 檢查並引導登入
 */

const { chromium } = require('playwright');

const DEBUG_PORT = 9222;
const WS_URL = 'ws://127.0.0.1:9222/devtools/browser/61aa85ae-01bb-4ae0-91b1-b143fe644647';

async function main() {
  console.log('===========================================');
  console.log(' Facebook - 檢查登入狀態');
  console.log('===========================================\n');

  try {
    // 連接到 Chrome
    console.log('連接到 Chrome...');
    const browser = await chromium.connect({
      browserWSEndpoint: WS_URL,
      ignoreHTTPSErrors: true,
    });

    // 創建新頁面
    console.log('打開 Facebook...');
    const page = await browser.newPage();
    await page.goto('https://www.facebook.com', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log(`URL: ${page.url()}`);
    console.log(`標題: ${await page.title()}\n`);

    if (page.url().includes('login')) {
      console.log('❌ 需要登入！\n');
      console.log('===========================================');
      console.log(' 請在瀏覽器中完成以下操作：');
      console.log(' 1. 輸入郵箱: j@smartquote.cn');
      console.log(' 2. 輸入密碼: Pin4fb123');
      console.log(' 3. 完成驗證');
      console.log(' 4. 點擊「信任此裝置」');
      console.log(' 5. 完成後回來告訴我');
      console.log('===========================================\n');
    } else {
      console.log('✅ 已登入！\n');
      console.log('可以開始發文了！');
    }

    console.log('保持瀏覽器開啟...\n');
    await new Promise(() => {});

  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

main();
