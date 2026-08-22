/**
 * 通過 CDP 連接用戶已登入的 Chrome
 * 使用 Chrome Remote Debugging
 */
const { chromium } = require('playwright');

async function main() {
  // 嘗試通過 CDP 連接 Chrome
  console.log('嘗試 CDP 連接...');
  
  let browser;
  try {
    // 方法1: 連接到已運行的 Chrome (通过已有的 debugging port)
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('CDP 連接成功！');
  } catch (e) {
    console.log('CDP 連接失敗:', e.message);
    console.log('\n需要手動啟動 Chrome 調試模式:');
    console.log('1. 關閉所有 Chrome 窗口');
    console.log('2. 打開終端，運行:');
    console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    console.log('3. 在打開的 Chrome 中登入 Facebook');
    console.log('4. 然後重新運行這個腳本');
    return;
  }
  
  // 列出所有上下文
  const contexts = browser.contexts();
  console.log('瀏覽器上下文數量:', contexts.length);
  
  for (const ctx of contexts) {
    const pages = ctx.pages();
    console.log('  上下文頁面數量:', pages.length);
    for (const p of pages) {
      console.log('    -', p.url());
    }
  }
  
  // 創建新頁面
  const page = await contexts[0].newPage();
  console.log('\n創建新頁面');
  
  // 測試訪問 Facebook 搜索
  console.log('\n測試搜索頁面...');
  await page.goto('https://www.facebook.com/search/groups?q=%E6%B8%AF%E8%BD%A6%E5%8C%97%E4%B8%8A', {
    waitUntil: 'domcontentloaded',
    timeout: 20000
  });
  
  await page.waitForTimeout(3000);
  
  const url = page.url();
  const title = await page.title();
  console.log('當前 URL:', url);
  console.log('頁面標題:', title);
  
  const html = await page.content();
  console.log('HTML 長度:', html.length);
  console.log('HTML 前 200 字:', html.substring(0, 200));
  
  await page.screenshot({ path: 'cdp_search.png' });
  console.log('截圖已保存');
  
  // 找元素
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body 文字前 300 字:', bodyText.substring(0, 300));
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
