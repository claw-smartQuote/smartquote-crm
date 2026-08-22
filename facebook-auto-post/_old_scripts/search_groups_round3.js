/**
 * Facebook 群組搜索腳本 - 第三輪
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

const newKeywords = [
  // 更多汽車品牌
  'Ford 港車北上',
  'Volkswagen 保險',
  'Mazda 兩地車',
  'Subaru 保險',
  'Kia 港車北上',
  'Hyundai 保險',
  
  // 電動車型號
  'Tesla Model 3 保險',
  'Tesla Model Y 保險',
  'BYD Seal 保險',
  'BYD Dolphin 保險',
  'BYD Atto3 保險',
  'MG 電動車 保險',
  'Volvo 電動車 保險',
  
  // 車主會
  '凌志車主會',
  '奔馳車主會',
  '寶馬車主會',
  '保時捷車主會',
  '奧迪車主會',
  
  // 二手車
  '二手車 港車北上',
  '二手進口車 香港',
  '水貨車 保險',
  '平行進口車 保險',
  
  // 汽車零件/改裝
  '汽車改裝 港車',
  '汽車零件 雨刷',
  '車輪 輪胎 北上',
  
  // 自駕遊
  '港人北上 自駕遊',
  '廣東自駕遊',
  '深圳自駕遊',
  '珠海自駕遊',
  '大灣區自駕遊',
  
  // 駕照/證件
  '內地駕照 換領',
  '香港駕照 內地使用',
  '中港車牌',
  '粵港車牌',
  
  // 停車/充電
  '港車北上 停車',
  '電動車 充電樁',
  '充電站 大灣區',
  
  // 維修/保養
  '大陸汽車維修',
  '港車北上 保養',
  '兩地車 維修',
  
  // 保險比較
  '永誠保險',
  '汽車保險 报价',
  '交強險 商業險',
  '三者險 100萬',
  '車上人員險',
  '盜搶險 保險',
];

const CONFIG = {
  outputFile: './target_groups_clean.json',
};

let allGroups = new Map();

function loadExistingGroups() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
    data.groups.forEach(g => allGroups.set(g.id, g));
    console.log(`已載入 ${allGroups.size} 個現有群組`);
  } catch (e) {
    console.log('無法載入現有群組:', e.message);
  }
}

function saveAllGroups() {
  const groups = Array.from(allGroups.values());
  const data = {
    description: 'Facebook自動發文目標群組列表',
    account: '萊to@smartquote.cn',
    total_unique_groups: groups.length,
    last_updated: new Date().toISOString().split('T')[0],
    groups: groups,
  };
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2, 'utf8'));
  console.log(`已保存 ${groups.length} 個群組`);
}

async function humanDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

async function extractGroups(page) {
  const newGroups = [];
  try {
    await page.waitForSelector('[href*="/groups/"]', { timeout: 3000 }).catch(() => {});
    await humanDelay(1000, 2000);
    
    const groupLinks = await page.$$eval('a[href*="/groups/"]', links => {
      return links.map(link => {
        const href = link.href;
        const match = href.match(/\/groups\/(\d+)/);
        if (match) {
          return {
            id: match[1],
            url: href.split('?')[0],
            name: link.textContent?.trim().substring(0, 100) || match[1],
          };
        }
        return null;
      }).filter(Boolean);
    });
    
    groupLinks.forEach(g => {
      if (!allGroups.has(g.id)) {
        allGroups.set(g.id, { ...g, category: '新增' });
        newGroups.push(g);
      }
    });
  } catch (e) {}
  return newGroups;
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 群組搜索 - 第三輪');
  console.log(` 關鍵詞: ${newKeywords.length} 個`);
  console.log('===========================================\n');

  let browser = null;

  try {
    console.log('[1/4] 連接到 Chrome...');
    const versionData = await fetch('http://127.0.0.1:9222/json/version');
    const versionJson = await versionData.json();
    
    browser = await puppeteer.connect({
      browserWSEndpoint: versionJson.webSocketDebuggerUrl,
      ignoreHTTPSErrors: true,
    });
    console.log('✅ 已連接\n');

    let pages = await browser.pages();
    let page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('[2/4] 載入現有群組...');
    loadExistingGroups();
    console.log('');

    console.log('[3/4] 搜索群組...\n');
    let totalNew = 0;

    for (let i = 0; i < newKeywords.length; i++) {
      const keyword = newKeywords[i];
      process.stdout.write(`[${i + 1}/${newKeywords.length}] "${keyword}"`);
      
      try {
        const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await humanDelay(3000, 5000);
        
        for (let scroll = 0; scroll < 3; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 500));
          await humanDelay(1000, 2000);
        }
        
        const newGroups = await extractGroups(page);
        totalNew += newGroups.length;
        
        if (newGroups.length > 0) {
          console.log(` ✅ +${newGroups.length} (總計: ${allGroups.size})`);
        } else {
          console.log(' ⚠️ 無新');
        }
        
      } catch (e) {
        console.log(` ❌ ${e.message.substring(0, 50)}`);
      }
      
      if ((i + 1) % 5 === 0) {
        saveAllGroups();
      }
      
      await humanDelay(2000, 4000);
    }

    console.log('\n[4/4] 保存結果...');
    saveAllGroups();
    
    console.log('\n===========================================');
    console.log(` 完成! 總群組: ${allGroups.size}, 新增: ${totalNew}`);
    console.log('===========================================');
    
    await page.screenshot({ path: '/tmp/fb_search_round3.png' });
    
    await browser.disconnect();
    
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.disconnect().catch(() => {});
  }
  
  process.exit(0);
}

main();