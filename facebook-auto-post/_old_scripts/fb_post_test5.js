/**
 * Facebook 自動發文測試
 * 向 5 個群組發送測試帖子
 */

const { chromium } = require('playwright');
const fs = require('fs');

// 讀取群組
const groupsData = JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8'));
const TEST_GROUPS = groupsData.groups.slice(0, 5); // 測試前5個

// 發文內容
const POST_TEMPLATES = [
  `【AI隨機文案】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 醫保外藥用險
✅ 12次道路救援（拖車、送油、換胎）
✅ 廣東話/國語雙語服務
WhatsApp 24小時報價👇
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,

  `【AI隨機文案】
🧐港車北上保險多少錢？
市場行情參考：
• 交強險 + 商業第三者責任險 + 醫保外用藥
✅ 12次道路救援（拖車、送油、換胎）
• 全套低至 ¥1469 起
與香港本地保險比較：
✅ 性價比更高
✅ 保障範圍更廣
✅ 粵/國語雙語服務
立馬 WhatsApp 比較報價！📱
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`
];

const TEST_MESSAGE = POST_TEMPLATES[Math.floor(Math.random() * POST_TEMPLATES.length)];
const AI_TEXT = `📅 ${new Date().toLocaleDateString('zh-TW')} 駕駛北上，記得檢查車況，確保行車安全。祝你旅途平安！`;
const FULL_MESSAGE = TEST_MESSAGE.replace('【AI隨機文案】', `【${AI_TEXT}】`);

let successCount = 0;
let failCount = 0;

(async () => {
  console.log('🚀 Facebook 自動發文測試開始');
  console.log(`📝 測試群組數: ${TEST_GROUPS.length}`);
  console.log('='.repeat(50));
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: './fb_session_logged_in.json'
  });

  const page = await context.newPage();
  
  // 測試登入
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  if (await page.$('input[name="email"]')) {
    console.log('❌ 需要登入！');
    await browser.close();
    return;
  }
  console.log('✅ 已登入\n');
  
  // 向每個群組發文
  for (let i = 0; i < TEST_GROUPS.length; i++) {
    const group = TEST_GROUPS[i];
    console.log(`\n[${i+1}/${TEST_GROUPS.length}] 群組: ${group.name}`);
    
    try {
      await page.goto(`https://www.facebook.com/groups/${group.id}`, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      await page.waitForTimeout(2000);
      
      // 使用 JS 點擊方式
      const result = await page.evaluate(async () => {
        // 點擊發佈按鈕
        const buttons = Array.from(document.querySelectorAll('div[role="button"], span'));
        let clicked = false;
        
        for (const btn of buttons) {
          const text = btn.innerText?.trim();
          if (text && (text.includes('發佈') || text.includes('Share') || text.includes('分享') || text.includes('動態'))) {
            btn.click();
            clicked = true;
            break;
          }
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        // 找發文框
        const selectors = [
          'div[contenteditable="true"][role="textarea"]',
          'textarea[name="message"]',
          'div[aria-label*="發佈"]',
          'div[contenteditable="true"]'
        ];
        
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            return { success: true, selector: sel };
          }
        }
        return { success: false, clicked };
      });
      
      if (result.success) {
        // 輸入文字
        await page.keyboard.type(FULL_MESSAGE, { delay: 15 });
        await page.waitForTimeout(1000);
        
        // 點擊發佈
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
          for (const btn of buttons) {
            const text = btn.innerText?.trim();
            if (text && (text.includes('發佈') || text === 'Post' || text.includes('分享'))) {
              btn.click();
              break;
            }
          }
        });
        
        await page.waitForTimeout(3000);
        console.log(`  ✅ 成功發送`);
        successCount++;
      } else {
        console.log(`  ⚠️ 未找到發文框`);
        failCount++;
      }
      
    } catch (e) {
      console.log(`  ❌ 錯誤: ${e.message}`);
      failCount++;
    }
    
    await page.waitForTimeout(2000);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 結果: 成功 ${successCount}, 失敗 ${failCount}`);
  console.log('='.repeat(50));
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
  console.log('\n✅ 測試完成');
})();
