/**
 * 港車北上群組自動加入 - 保守版
 * 每輪少量加入，等待夠長時間
 */
const { chromium } = require('playwright');

const KEYWORDS = [
  '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
  '大灣區車', '保姆車', '七人車', '珠海北上', '深圳北上'
];

const JOIN_PER_KEYWORD = 3; // 每關鍵詞只加 3 個

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== 港車北上群組加入 - 保守版 ===\n');
  
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✓ CDP 連接成功\n');
  } catch (e) {
    console.log('✗ CDP 連接失敗:', e.message);
    return;
  }
  
  const context = browser.contexts()[0];
  const page = await context.newPage();
  
  let totalJoined = 0;
  
  for (const keyword of KEYWORDS) {
    console.log(`\n【搜索】${keyword}`);
    const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
    
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2500);
      
      for (let scroll = 0; scroll < 2; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await sleep(800);
      }
      
      const joinButtons = await page.locator('div[role="button"]:has-text("加入"), span:has-text("加入")').all();
      console.log(`  找到 ${joinButtons.length} 個按鈕`);
      
      let joinedThis = 0;
      for (let i = 0; i < Math.min(joinButtons.length, JOIN_PER_KEYWORD); i++) {
        const btn = joinButtons[i];
        try {
          await btn.scrollIntoViewIfNeeded();
          await sleep(300);
          
          await page.evaluate((button) => {
            button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
            button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            button.click();
          }, await btn.elementHandle());
          
          totalJoined++;
          joinedThis++;
          console.log(`  ✓ [${totalJoined}] 加入成功`);
          await sleep(4000); // 加入間隔 4 秒
          
        } catch (e) {
          console.log(`  ✗`, e.message.substring(0, 30));
        }
      }
      
      if (joinedThis === 0) console.log(`  × 無按鈕`);
      
    } catch (e) {
      console.log(`  × 出錯:`, e.message.substring(0, 50));
    }
    
    await sleep(4000); // 關鍵詞之間 4 秒
  }
  
  console.log(`\n=== 完成！總共加入 ${totalJoined} 個群組 ===`);
  
  const fs = require('fs');
  fs.writeFileSync('hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    total: totalJoined
  }, null, 2));
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
