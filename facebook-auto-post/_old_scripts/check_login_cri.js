/**
 * Facebook 自動發文 - 使用 chrome-remote-interface
 */

const CDP = require('chrome-remote-interface');

async function main() {
  console.log('===========================================');
  console.log(' Facebook - 檢查登入狀態');
  console.log('===========================================\n');

  try {
    // 連接到 Chrome
    console.log('連接到 Chrome...');
    const client = await CDP({
      host: '127.0.0.1',
      port: 9222
    });

    const { Page, Network } = client;
    
    // 啟用 Page 域
    await Page.enable();
    await Network.enable();

    // 導航到 Facebook
    console.log('導航到 Facebook...');
    await Page.navigate({ url: 'https://www.facebook.com' });
    await Page.loadEventFired();
    
    // 等待一段時間
    await new Promise(r => setTimeout(r, 5000));

    // 獲取當前 URL
    const { frameTree } = await Page.getFrameTree();
    const url = frameTree.frame.url || 'unknown';
    console.log(`URL: ${url}\n`);

    if (url.includes('login')) {
      console.log('❌ 需要登入！\n');
      console.log('===========================================');
      console.log(' 請在 Chrome 瀏覽器中完成以下操作：');
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

    await client.close();
    console.log('\n保持 Chrome 開啟...\n');
    await new Promise(() => {});

  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

main();
