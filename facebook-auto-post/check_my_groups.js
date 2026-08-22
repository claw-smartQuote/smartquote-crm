/**
 * 檢查 Facebook 帳戶已加入的群組數量
 */
const { chromium } = require('playwright');

async function main() {
  console.log('連接 Chrome...');
  
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch (e) {
    console.log('連接失敗:', e.message);
    return;
  }
  
  const context = browser.contexts()[0];
  const page = await context.newPage();
  
  // 訪問 Facebook 群組頁面
  console.log('\n訪問群組頁面...');
  await page.goto('https://www.facebook.com/groups', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  const url = page.url();
  console.log('當前 URL:', url);
  
  // 滾動載入
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
  }
  
  // 找群組列表
  const groups = await page.locator('[href*="/groups/"]').all();
  console.log(`找到 ${groups.length} 個群組連結`);
  
  // 截圖
  await page.screenshot({ path: 'my_groups.png', fullPage: true });
  console.log('截圖已保存: my_groups.png');
  
  // 提取群組名稱
  const groupNames = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
    const names = links.map(a => ({
      name: a.innerText.split('\n')[0],
      href: a.href
    })).filter(g => g.name && g.href.includes('/groups/') && !g.href.includes('facebook.com/groups/'));
    return names.slice(0, 100);
  });
  
  console.log('\n群組列表 (前20個):');
  groupNames.slice(0, 20).forEach((g, i) => {
    console.log(`  ${i+1}. ${g.name}`);
  });
  
  console.log(`\n總共顯示: ${groupNames.length} 個群組`);
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
