/**
 * 從 Facebook 提取已加入的群組列表
 * 支持手動登入後自動繼續
 */

const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('🚀 啟動瀏覽器...');
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 檢查是否已登入
  const loginForm = await page.$('input[name="email"]');
  
  if (loginForm) {
    console.log('⚠️  需要手動登入！');
    console.log('='.repeat(50));
    console.log('請在瀏覽器中手動登入 Facebook');
    console.log('帳戶: 萊to@smartquote.cn');
    console.log('='.repeat(50));
    
    // 等待登入完成（檢查 URL 變化或登入表單消失）
    let waited = 0;
    while (await page.$('input[name="email"]') && waited < 120) {
      await page.waitForTimeout(2000);
      waited += 2;
      process.stdout.write(`\r等待登入... ${waited}s `);
    }
    console.log('\n');
    
    if (await page.$('input[name="email"]')) {
      console.log('❌ 登入超時！');
      await browser.close();
      return;
    }
    
    console.log('✅ 登入成功！');
  } else {
    console.log('✅ 已自動登入！');
  }
  
  // 保存 session
  const storage = await context.storageState();
  fs.writeFileSync('./fb_session_logged_in.json', JSON.stringify(storage));
  console.log('💾 Session 已保存到 fb_session_logged_in.json');
  
  // 導航到群組頁面
  console.log('\n📋 提取已加入的群組...');
  await page.goto('https://www.facebook.com/groups', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 滾動載入更多群組
  console.log('📜 滾動載入群組列表...');
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    if (i % 5 === 0) process.stdout.write(`\r  滾動中... ${i+1}/20`);
  }
  console.log('\n');
  
  // 提取群組資訊
  const groups = await page.evaluate(() => {
    const results = [];
    const links = document.querySelectorAll('a[href*="/groups/"]');
    const seen = new Set();
    
    for (const link of links) {
      const href = link.href;
      const match = href.match(/\/groups\/([a-zA-Z0-9]+)/);
      
      if (match) {
        const id = match[1];
        if (!seen.has(id) && !id.includes('?')) {
          seen.add(id);
          const nameEl = link.querySelector('span') || link;
          const name = nameEl.innerText?.trim() || id;
          if (!name.includes('群組') && !name.includes('Group')) {
            results.push({
              id: id,
              name: name.substring(0, 100),
              url: `https://www.facebook.com/groups/${id}/`
            });
          }
        }
      }
    }
    return results;
  });
  
  console.log(`\n✅ 共找到 ${groups.length} 個群組`);
  
  // 分類
  const hkNorthKeywords = ['港車北上', '兩地牌', '中港車', '粵港車', '跨境車', '大灣區', '北上', '保姆車', '七人車', '珠海', '深圳', '廣東', '惠州', '東莞', '中山', '佛山', '廣州'];
  
  const hkNorthGroups = groups.filter(g => 
    hkNorthKeywords.some(kw => g.name.includes(kw))
  );
  const otherGroups = groups.filter(g => 
    !hkNorthKeywords.some(kw => g.name.includes(kw))
  );
  
  console.log(`\n📊 分類結果：`);
  console.log(`  🚗 港車北上相關: ${hkNorthGroups.length} 個`);
  console.log(`  📁 其他群組: ${otherGroups.length} 個`);
  
  // 保存
  const output = {
    date: new Date().toISOString(),
    total: groups.length,
    hk_north_count: hkNorthGroups.length,
    other_count: otherGroups.length,
    hk_north: hkNorthGroups,
    other: otherGroups,
    all: groups
  };
  
  fs.writeFileSync('./fb_all_joined_groups.json', JSON.stringify(output, null, 2));
  
  // 更新 CSV
  let csv = '群組ID,名稱,分類,Facebook網址\n';
  for (const g of hkNorthGroups) {
    csv += `${g.id},"${g.name}",港車北上,${g.url}\n`;
  }
  for (const g of otherGroups) {
    csv += `${g.id},"${g.name}",其他,${g.url}\n`;
  }
  fs.writeFileSync('./fb_groups_joined_list.csv', csv);
  
  // 顯示港車北上群組
  if (hkNorthGroups.length > 0) {
    console.log('\n🚗 港車北上相關群組：');
    hkNorthGroups.forEach((g, i) => console.log(`  ${i+1}. ${g.name}`));
  }
  
  console.log('\n💾 已保存：');
  console.log('   fb_all_joined_groups.json (完整資料)');
  console.log('   fb_groups_joined_list.csv (分類列表)');
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
  console.log('\n✅ 完成！');
})();
