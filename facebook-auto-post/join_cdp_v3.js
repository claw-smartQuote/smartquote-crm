/**
 * 港車北上群組自動加入 - CDP 模式 v3 (優化版)
 */
const { chromium } = require('playwright');

const KEYWORDS = [
  '港車北上', '兩地牌', '中港車', '粵港車', '跨境車',
  '大灣區車', '保姆車', '七人車', '珠海北上', '深圳北上'
];

const TARGET_COUNT = 50;
const JOIN_PER_KEYWORD = 5; // 每關鍵詞數量

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== 港車北上群組自動加入 v3 ===\n');
  
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
    if (totalJoined >= TARGET_COUNT) break;
    
    console.log(`\n【搜索】${keyword}`);
    const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
    
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
      
      // 滾動
      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await sleep(800);
      }
      
      // 找加入按鈕
      const joinButtons = await page.locator('div[role="button"]:has-text("加入"), span:has-text("加入")').all();
      console.log(`  找到 ${joinButtons.length} 個按鈕`);
      
      let joinedThis = 0;
      for (let i = 0; i < Math.min(joinButtons.length, JOIN_PER_KEYWORD); i++) {
        if (totalJoined >= TARGET_COUNT || joinedThis >= JOIN_PER_KEYWORD) break;
        
        const btn = joinButtons[i];
        try {
          await btn.scrollIntoViewIfNeeded();
          await sleep(500);
          
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
          await sleep(3000); // 等待 3 秒
          
        } catch (e) {
          console.log(`  ✗ 失敗:`, e.message.substring(0, 40));
        }
      }
      
      if (joinedThis === 0) console.log(`  × 無按鈕`);
      
    } catch (e) {
      console.log(`  × 出錯:`, e.message.substring(0, 60));
    }
    
    await sleep(3000); // 關鍵詞之間等待 3 秒
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
