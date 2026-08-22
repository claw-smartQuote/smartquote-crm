/**
 * 港車北上群組自動加入 - CDP 模式
 * 連接用戶已登入的 Chrome，繞過自動化檢測
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

async function clickWithJS(page, locator) {
  // 嘗試 JavaScript 點擊以繞過某些點擊監測
  try {
    const el = await locator.elementHandle();
    if (el) {
      await page.evaluate((element) => {
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        element.click();
      }, el);
      return true;
    }
  } catch (e) {}
  return false;
}

async function main() {
  console.log('=== 港車北上群組自動加入 ===\n');
  
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
      
      // 滾動頁面讓動態內容載入
      for (let scroll = 0; scroll < 4; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(1200);
      }
      
      console.log(`  頁面載入完成`);
      
      // 找所有包含 "加入" 的按鈕
      // Facebook 的加入按鈕可能是 div[role="button"] 或 span 或其他元素
      const joinSelectors = [
        'div[role="button"]:has-text("加入")',
        'span:has-text("加入")',
        'div:has-text("加入")',
        'span:contains("加入")'
      ];
      
      let joinButtons = [];
      for (const sel of joinSelectors) {
        try {
          const btns = await page.locator(sel).all();
          if (btns.length > 0) {
            console.log(`  選擇器 "${sel}" 找到 ${btns.length} 個`);
            joinButtons.push(...btns);
          }
        } catch (e) {}
      }
      
      // 去重
      const uniqueButtons = [];
      const seen = new Set();
      for (const btn of joinButtons) {
        try {
          const txt = await btn.innerText();
          if (!seen.has(txt)) {
            seen.add(txt);
            uniqueButtons.push(btn);
          }
        } catch (e) {}
      }
      
      console.log(`  總共找到 ${uniqueButtons.length} 個加入按鈕`);
      
      let joinedThis = 0;
      for (const btn of uniqueButtons) {
        if (totalJoined >= TARGET_COUNT || joinedThis >= JOIN_PER_KEYWORD) break;
        
        try {
          // 滾動到按鈕可見
          await btn.scrollIntoViewIfNeeded();
          await sleep(500);
          
          // 點擊
          await btn.click({ timeout: 3000 });
          totalJoined++;
          joinedThis++;
          
          // 獲取群組名
          let groupName = '';
          try {
            // 嘗試找到群組名稱（在按鈕附近的文字）
            const parent = await btn.evaluateHandle((el) => {
              const container = el.closest('div[role="article"]') || el.parentElement;
              return container;
            });
            const txt = await page.evaluate((el) => el.innerText.substring(0, 50), parent);
            groupName = txt.replace(/\n加入.*/g, '').trim();
          } catch (e) {}
          
          joinedGroups.push({
            name: groupName,
            keyword,
            time: new Date().toISOString()
          });
          
          console.log(`  ✓ [${totalJoined}] 加入成功`);
          
          await sleep(2500); // 等待加入完成
          
        } catch (e) {
          console.log(`  ✗ 按鈕點擊失敗:`, e.message.substring(0, 50));
        }
      }
      
      if (joinedThis === 0) {
        console.log(`  × 沒有找到可點擊的加入按鈕`);
      }
      
    } catch (e) {
      console.log(`  × 搜索出錯:`, e.message.substring(0, 100));
    }
    
    await sleep(2000);
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`總共加入: ${totalJoined} 個群組`);
  
  // 保存結果
  const fs = require('fs');
  const result = {
    date: new Date().toISOString(),
    total: totalJoined,
    groups: joinedGroups
  };
  fs.writeFileSync('hk_north_groups_joined.json', JSON.stringify(result, null, 2));
  console.log('結果已保存: hk_north_groups_joined.json');
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
