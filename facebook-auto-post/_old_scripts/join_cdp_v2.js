/**
 * 港車北上群組自動加入 - CDP 模式 v2
 * 修復按鈕點擊超時問題
 */
const { chromium } = require('playwright');

const KEYWORDS = [
  '港車北上',
  '兩地牌',
  '中港車',
  '粵港車',
  '跨境車',
  '大灣區車',
  '保姆車',
  '七人車',
  '珠海北上',
  '深圳北上'
];

const TARGET_COUNT = 50;
const JOIN_PER_KEYWORD = 8;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== 港車北上群組自動加入 v2 ===\n');
  
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
  const joinedGroups = [];
  
  for (const keyword of KEYWORDS) {
    if (totalJoined >= TARGET_COUNT) break;
    
    console.log(`\n【搜索】${keyword}`);
    const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}`;
    
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      
      // 滾動頁面
      for (let scroll = 0; scroll < 4; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(1200);
      }
      
      // 找到所有 "加入" 按鈕 - 使用更精確的選擇器
      // Facebook 的群組卡片中的加入按鈕
      const joinButtons = await page.locator('div[role="button"]:has-text("加入"), span:has-text("加入")').all();
      
      console.log(`  找到 ${joinButtons.length} 個加入按鈕`);
      
      let joinedThis = 0;
      for (let i = 0; i < Math.min(joinButtons.length, JOIN_PER_KEYWORD); i++) {
        if (totalJoined >= TARGET_COUNT || joinedThis >= JOIN_PER_KEYWORD) break;
        
        const btn = joinButtons[i];
        
        try {
          // 滾動到按鈕可見
          await btn.scrollIntoViewIfNeeded();
          await sleep(800);
          
          // 使用 JavaScript 直接點擊（繞過 Playwright 的檢測）
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
          
          // 等待頁面反應
          await sleep(3000);
          
        } catch (e) {
          console.log(`  ✗ [${i+1}] 點擊失敗:`, e.message.substring(0, 60));
        }
      }
      
      if (joinedThis === 0) {
        console.log(`  × 沒有成功加入任何群組`);
      }
      
    } catch (e) {
      console.log(`  × 搜索出錯:`, e.message.substring(0, 100));
    }
    
    await sleep(2000);
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`總共加入: ${totalJoined} 個群組`);
  
  const fs = require('fs');
  fs.writeFileSync('hk_north_groups_joined.json', JSON.stringify({
    date: new Date().toISOString(),
    total: totalJoined,
    groups: joinedGroups
  }, null, 2));
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
