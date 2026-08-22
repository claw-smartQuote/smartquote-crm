const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

// 從 target_groups_clean.json 提取的港車北上相關群組
const TARGET_GROUPS = [
  { id: '758082796210463', name: '香港車北上保險資訊站' },
  { id: '1134980217432060', name: '港車北上保險比較' },
  { id: '321148588376306', name: '中港兩地牌、現牌、申辦、2⃣️地業務維護交流群' },
  { id: '404133995949919', name: '🇭🇰港車北上車主群組🚗' },
  { id: '262480086925030', name: '港車北上交流(和平版)' },
  { id: '1063249075120137', name: '港車北上珠海挚星Benz專修' },
  { id: '247300071052008', name: '港車北上 中港駕駛關注組' },
  { id: '10018604614896926', name: '港車北上車保掂' },
  { id: '2259521914245505', name: '港車北上注意群' },
  { id: '1102679564430486', name: '中港車牌交易平台、港車北上' },
  { id: '295469670106036', name: '電動車港車北上同學會' },
  { id: '2109664272797094', name: '車cam L（港車北上）' },
  { id: '1121994158828910', name: '中港車接送酒店機場' },
  { id: '564255125550799', name: '港車北上分享群' },
  { id: 'hkcartochina', name: '港車北上討論群' },
  { id: '1704793273331932', name: '港車北上吃喝玩樂整車group' },
  { id: '1605514229875103', name: '港車北上交流群' },
  { id: '1326199508230411', name: '港車北上自駕游攻略' },
  { id: '929380740477410', name: '港車北上-珠海 中山美食遊玩攻略' },
  { id: '666479762252775', name: 'Tesla港車北上(改車篇)' },
  { id: '614896855332328', name: '港車北上保險優惠' },
  { id: '1693865941075142', name: '港車北上車主必讀' },
  { id: '7394737537295230', name: '兩地牌車主群' },
  { id: '1069358984379734', name: '中港車保險討論區' },
  { id: '1286914682161843', name: '港車北上維修保養' },
  { id: '1586967228478522', name: '兩地牌申請交流' },
  { id: '1022438418289452', name: '港車北上美食推薦' },
  { id: '1084875059218428', name: '中港自駕遊' },
  { id: '1221899088426735', name: '兩地車牌代辦' },
  { id: '1498375927294870', name: '北上車保資訊' }
];

const JOIN_DELAY = 2500; // 加入後等待時間
const SCROLL_DELAY = 800;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function humanDelay() {
  await sleep(1500 + Math.random() * 1500);
}

async function joinGroups() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ 
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  
  // 登入
  console.log('🔐 登入 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await humanDelay();
  
  // 填寫登入
  await page.fill('input[name="email"]', EMAIL);
  await sleep(400 + Math.random() * 300);
  await page.fill('input[name="pass"]', PASSWORD);
  await sleep(400 + Math.random() * 300);
  await page.click('button[name="login"]');
  
  console.log('⏳ 等待登入完成...');
  await sleep(5000);
  
  // 檢查是否登入成功
  const currentUrl = page.url();
  console.log('📍 當前 URL:', currentUrl);
  
  const joinedResults = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < TARGET_GROUPS.length; i++) {
    const group = TARGET_GROUPS[i];
    console.log(`\n[${i+1}/${TARGET_GROUPS.length}] 嘗試加入: ${group.name}`);
    
    try {
      // 訪問群組頁面
      const groupUrl = `https://www.facebook.com/groups/${group.id}`;
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await humanDelay();
      
      // 滾動一下讓頁面載入
      await page.evaluate(() => window.scrollBy(0, 300));
      await sleep(SCROLL_DELAY);
      
      // 找加入按鈕 - 多種選擇器
      let joined = false;
      const buttonSelectors = [
        'div[aria-label="加入群組"]',
        'div[aria-label="加入"]',
        'span:has-text("加入群組")',
        'div[role="button"]:has-text("加入")',
        'div:has-text("加入群組")'
      ];
      
      for (const selector of buttonSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn && await btn.isVisible()) {
            await btn.click();
            console.log(`  ✅ 點擊加入按鈕`);
            joined = true;
            successCount++;
            joinedResults.push({ ...group, status: 'success' });
            break;
          }
        } catch {}
      }
      
      if (!joined) {
        console.log(`  ⚠️ 未找到加入按鈕`);
        failCount++;
        joinedResults.push({ ...group, status: 'no_button' });
      }
      
    } catch (e) {
      console.log(`  ❌ 錯誤: ${e.message.substring(0, 80)}`);
      failCount++;
      joinedResults.push({ ...group, status: 'error' });
    }
    
    await sleep(JOIN_DELAY);
  }
  
  console.log(`\n🎉 完成！成功: ${successCount}, 失敗: ${failCount}`);
  
  // 保存結果
  const resultFile = path.join(WORK_DIR, 'hk_north_joined_v3.json');
  fs.writeFileSync(resultFile, JSON.stringify({
    date: new Date().toISOString(),
    success: successCount,
    fail: failCount,
    results: joinedResults
  }, null, 2));
  console.log(`📁 已保存: ${resultFile}`);
  
  await browser.close();
}

joinGroups().catch(e => {
  console.error('嚴重錯誤:', e);
  process.exit(1);
});
