/**
 * Facebook 群組搜索腳本 - 繼續搜索
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

const remainingKeywords = [
  // 從 Audi 繼續
  'Audi 兩地車',
  'Audi 保險',
  'Porsche 卡宴 保險',
  'Lexus 港車 保險',
  'Toyota 埃尔法 保險',
  'Honda 港車北上',
  '香港車主 內地自駕',
  '港人內地駕車',
  '香港司機 大灣區',
  '跨境車主 交流',
  '中港駕照 討論',
  '汽車保險 比較 香港',
  '車險 報價 比較',
  '保險 索償 經驗',
  '汽車全保 第三者',
  '大灣區 置業 汽車',
  '香港人 深圳 購車',
  '港人北上 購車 用車',
  '粵港澳大灣區 車主',
  '保姆車 港車北上',
  '七人車 保險 比較',
  'SUV 港車北上',
  'MPV 兩地車',
  '私家車 費用 計算',
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
  console.log(' Facebook 群組搜索 - 繼續搜索');
  console.log(` 剩餘關鍵詞: ${remainingKeywords.length} 個`);
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

    console.log('[3/4] 繼續搜索...\n');
    let totalNew = 0;

    for (let i = 0; i < remainingKeywords.length; i++) {
      const keyword = remainingKeywords[i];
      console.log(`[${i + 1}/${remainingKeywords.length}] "${keyword}"`);
      
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
          console.log(`  ✅ +${newGroups.length} (總計: ${allGroups.size})`);
        } else {
          console.log(`  ⚠️ 無新群組`);
        }
        
      } catch (e) {
        console.log(`  ❌ ${e.message}`);
      }
      
      if ((i + 1) % 5 === 0) {
        saveAllGroups();
        console.log(`  💾 已保存\n`);
      }
      
      await humanDelay(2000, 4000);
    }

    console.log('\n[4/4] 保存結果...');
    saveAllGroups();
    
    console.log('\n===========================================');
    console.log(` 完成! 總群組: ${allGroups.size}, 新增: ${totalNew}`);
    console.log('===========================================');
    
    await page.screenshot({ path: '/tmp/fb_search_continue.png' });
    
    await browser.disconnect();
    
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.disconnect().catch(() => {});
  }
  
  process.exit(0);
}

main();
