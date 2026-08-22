/**
 * Facebook 提取已加入群組 v2
 * 改進：等待頁面完全載入
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
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: './fb_session_logged_in.json'
  });

  const page = await context.newPage();
  
  console.log('📄 打開 Facebook 群組頁面...');
  await page.goto('https://www.facebook.com/groups', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // 滾動多次
  console.log('📜 滾動頁面...');
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);
  }
  
  // 截圖
  await page.screenshot({ path: './groups_page.png', fullPage: true });
  console.log('📸 截圖保存: groups_page.png');
  
  // 提取
  const groups = await page.evaluate(() => {
    const results = [];
    // 嘗試多個選擇器
    const items = document.querySelectorAll(
      'a[href*="/groups/"], div[data-testid*="group"], div[aria-label*="群組"]'
    );
    
    const seen = new Set();
    
    items.forEach(item => {
      const links = item.querySelectorAll ? item.querySelectorAll('a[href*="/groups/"]') : [item];
      links.forEach(link => {
        const href = link.href || link.getAttribute('href');
        if (!href) return;
        
        const match = href.match(/\/groups\/([a-zA-Z0-9]+)/);
        if (match && !seen.has(match[1]) && !match[1].includes('?')) {
          seen.add(match[1]);
          const name = link.innerText?.trim() || match[1];
          if (name && name.length > 1 && name.length < 200) {
            results.push({
              id: match[1],
              name: name,
              url: `https://www.facebook.com/groups/${match[1]}/`
            });
          }
        }
      });
    });
    
    return results;
  });
  
  console.log(`\n✅ 找到 ${groups.length} 個群組`);
  
  // 分類
  const hkNorthKeywords = ['北上', '兩地牌', '中港', '粵港', '跨境', '大灣區', '保姆車', '七人車', '珠海', '深圳', '廣東'];
  
  const hkNorth = groups.filter(g => hkNorthKeywords.some(k => g.name.includes(k)));
  const other = groups.filter(g => !hkNorthKeywords.some(k => g.name.includes(k)));
  
  console.log(`\n📊 港車北上相關: ${hkNorth.length}`);
  console.log(`📊 其他: ${other.length}`);
  
  // 保存
  fs.writeFileSync('./fb_all_joined_groups.json', JSON.stringify({
    date: new Date().toISOString(),
    total: groups.length,
    hk_north_count: hkNorth.length,
    other_count: other.length,
    hk_north: hkNorth,
    other: other,
    all: groups
  }, null, 2));
  
  let csv = '群組ID,名稱,分類,Facebook網址\n';
  hkNorth.forEach(g => csv += `${g.id},"${g.name}",港車北上,${g.url}\n`);
  other.forEach(g => csv += `${g.id},"${g.name}",其他,${g.url}\n`);
  fs.writeFileSync('./fb_groups_joined_list.csv', csv);
  
  console.log('\n💾 已保存');
  
  if (hkNorth.length > 0) {
    console.log('\n🚗 港車北上群組:');
    hkNorth.forEach((g, i) => console.log(`  ${i+1}. ${g.name}`));
  }
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
  console.log('\n✅ 完成！');
})();
