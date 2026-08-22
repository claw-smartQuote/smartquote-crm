const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL = 'to@smartquote.cn';
const PASSWORD='***';
const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

const TARGET_GROUPS = [
  { id: '758082796210463', name: '香港車北上保險資訊站' },
  { id: '1134980217432060', name: '港車北上保險比較' },
  { id: '321148588376306', name: '中港兩地牌交流群' },
  { id: '404133995949919', name: '港車北上車主群組' },
  { id: '262480086925030', name: '港車北上交流' },
  { id: '247300071052008', name: '中港駕駛關注組' },
  { id: '10018604614896926', name: '港車北上車保掂' },
  { id: '2259521914245505', name: '港車北上注意群' },
  { id: '1102679564430486', name: '中港車牌交易平台' },
  { id: '295469670106036', name: '電動車港車北上' },
  { id: '2109664272797094', name: '車cam L北上' },
  { id: '1121994158828910', name: '中港車接送' },
  { id: '564255125550799', name: '港車北上分享群' },
  { id: 'hkcartochina', name: '港車北上討論群' },
  { id: '1704793273331932', name: '港車北上吃喝玩樂' },
  { id: '1605514229875103', name: '港車北上交流群' },
  { id: '1326199508230411', name: '港車北上自駕游攻略' },
  { id: '929380740477410', name: '珠海中山美食遊玩' },
  { id: '666479762252775', name: 'Tesla港車北上' },
  { id: '614896855332328', name: '港車北上保險優惠' },
  { id: '1693865941075142', name: '港車北上車主必讀' },
  { id: '7394737537295230', name: '兩地牌車主群' },
  { id: '1069358984379734', name: '中港車保險討論' },
  { id: '1286914682161843', name: '港車北上維修保養' },
  { id: '1586967228478522', name: '兩地牌申請交流' },
  { id: '1022438418289452', name: '港車北上美食推薦' },
  { id: '1084875059218428', name: '中港自駕遊' },
  { id: '1221899088426735', name: '兩地車牌代辦' },
  { id: '1498375927294870', name: '北上車保資訊' },
  { id: '322988394733724', name: '港車北上理財' },
  { id: '271028841912958', name: '兩地牌資訊站' },
  { id: '1925623201066854', name: '中港車保養' },
  { id: '2174621296076849', name: '北上車cam討論' },
  { id: '337466755272989', name: '兩地牌出租' },
  { id: '1176508389641625', name: '跨境車主' },
  { id: '2564852587027191', name: '粵港車討論' },
  { id: '1758896921074616', name: '保姆車北上' },
  { id: '1462023977579487', name: '七人車北上' }
];

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
  
  // 嘗試加載已有 session
  const sessionFile = path.join(WORK_DIR, 'fb_session_logged_in.json');
  if (fs.existsSync(sessionFile)) {
    console.log('📂 載入已有 session...');
    try {
      await context.addCookies(JSON.parse(fs.readFileSync(sessionFile, 'utf8')));
      await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log('Session 失效，需要重新登入');
    }
  }
  
  // 檢查是否已登入
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);
  
  const url = page.url();
  const needsLogin = url.includes('login') || await page.$('input[name="email"]');
  
  if (needsLogin) {
    console.log('🔐 執行登入...');
    await page.fill('input[name="email"]', EMAIL);
    await sleep(400 + Math.random() * 300);
    await page.fill('input[name="pass"]', PASSWORD);
    await sleep(400 + Math.random() * 300);
    
    // 按 Enter 提交
    await page.press('input[name="pass"]', 'Enter');
    console.log('⏳ 等待登入...');
    await sleep(6000);
  }
  
  console.log('✅ 登入完成');
  
  const joinedResults = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < TARGET_GROUPS.length; i++) {
    const group = TARGET_GROUPS[i];
    console.log(`\n[${i+1}/${TARGET_GROUPS.length}] 加入: ${group.name}`);
    
    try {
      const groupUrl = `https://www.facebook.com/groups/${group.id}`;
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await humanDelay();
      
      // 滾動
      await page.evaluate(() => window.scrollBy(0, 300));
      await sleep(1000);
      
      // 用 JavaScript 找加入按鈕
      const joinResult = await page.evaluate(() => {
        // 嘗試各种加入按鈕
        const selectors = [
          'div[aria-label="加入群組"]',
          'div[aria-label="加入"]',
          'div[role="button"]',
        ];
        
        for (const sel of selectors) {
          const btns = document.querySelectorAll(sel);
          for (const btn of btns) {
            const text = btn.textContent || '';
            if (text.trim() === '加入群組' || text.trim() === '加入') {
              btn.click();
              return 'clicked';
            }
          }
        }
        
        // 另一種方式
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          if (div.textContent.trim() === '加入群組' && div.offsetParent !== null) {
            div.click();
            return 'clicked';
          }
        }
        
        return 'not_found';
      });
      
      if (joinResult === 'clicked') {
        console.log(`  ✅ 已點擊加入`);
        successCount++;
        joinedResults.push({ ...group, status: 'success' });
      } else {
        console.log(`  ⚠️ 未找到按鈕`);
        failCount++;
        joinedResults.push({ ...group, status: 'not_found' });
      }
      
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 60)}`);
      failCount++;
      joinedResults.push({ ...group, status: 'error' });
    }
    
    await sleep(2000 + Math.random() * 1000);
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
  
  // 保存 session cookies
  const cookies = await context.cookies();
  fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));
  console.log(`📁 結果: ${resultFile}`);
  console.log(`🔑 Session 已更新`);
  
  await browser.close();
}

joinGroups().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});
