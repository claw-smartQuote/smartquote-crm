/**
 * Facebook 群組搜索腳本 v2.0
 * 搜索更多關鍵詞的群組
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

const CONFIG = {
  searchKeywords: [
    // 汽車保險相關
    '港車北上 汽車保險',
    '兩地車 保險',
    '中港車 保險',
    '粵港車  insurance',
    '大陸汽車保險 港車',
    
    // 電動車相關
    'Tesla 保險 香港',
    'BYD 海豹 保險',
    '電動車 港車北上',
    '新能源車 保险 香港',
    '小鵬汽車 保费',
    '蔚來汽車 保險',
    
    // 汽車品牌群組
    'BMW 港車北上',
    'Mercedes 保險',
    'Audi 兩地車',
    'Porsche 卡宴 保險',
    'Lexus 港車 保險',
    'Toyota 埃尔法 保險',
    'Honda 港車北上',
    
    // 汽車討論群組
    '香港車主 內地自駕',
    '港人內地駕車',
    '香港司機 大灣區',
    '跨境車主 交流',
    '中港駕照 討論',
    
    // 保險比較
    '汽車保險 比較 香港',
    '車險 報價 比較',
    '保險 索償 經驗',
    '汽車全保 第三者',
    
    // 大灣區生活
    '大灣區 置業 汽車',
    '香港人 深圳 購車',
    '港人北上 購車 用車',
    '粵港澳大灣區 車主',
    
    // 更多細分關鍵詞
    '保姆車 港車北上',
    '七人車 保險 比較',
    'SUV 港車北上',
    'MPV 兩地車',
    '私家車 費用 計算',
  ],
  outputFile: './target_groups_clean.json',
  existingGroups: [],
};

puppeteer.use(StealthPlugin());

let allGroups = new Map();

// 載入現有群組
function loadExistingGroups() {
  try {
    if (fs.existsSync(CONFIG.outputFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
      data.groups.forEach(g => allGroups.set(g.id, g));
      console.log(`已載入 ${allGroups.size} 個現有群組`);
    }
  } catch (e) {
    console.log('無法載入現有群組:', e.message);
  }
}

// 保存所有群組
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
  console.log(`已保存 ${groups.length} 個群組到 ${CONFIG.outputFile}`);
}

// 隨機延遲
async function humanDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

// 提取群組資訊
async function extractGroups(page) {
  const newGroups = [];
  
  try {
    // 等待群組卡片加載
    await page.waitForSelector('[href*="/groups/"]', { timeout: 5000 }).catch(() => {});
    await humanDelay(1000, 2000);
    
    // 查找所有群組鏈接
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
    
    // 去重並添加
    groupLinks.forEach(g => {
      if (!allGroups.has(g.id)) {
        allGroups.set(g.id, { ...g, category: '新增' });
        newGroups.push(g);
      }
    });
    
  } catch (e) {
    console.log('提取群組失敗:', e.message);
  }
  
  return newGroups;
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 群組搜索腳本 v2.0');
  console.log(' 關鍵詞數量: ' + CONFIG.searchKeywords.length);
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 連接到 Chrome
    console.log('[1/5] 連接到 Chrome Remote Debug...');
    
    const versionData = await fetch('http://127.0.0.1:9222/json/version');
    const versionJson = await versionData.json();
    console.log(`WebSocket URL: ${versionJson.webSocketDebuggerUrl}`);
    
    browser = await puppeteer.connect({
      browserWSEndpoint: versionJson.webSocketDebuggerUrl,
      ignoreHTTPSErrors: true,
    });

    console.log('✅ 已連接到 Chrome\n');

    // 2. 獲取或創建頁面
    console.log('[2/5] 準備頁面...');
    let pages = await browser.pages();
    let page;
    
    if (pages.length === 0) {
      page = await browser.newPage();
    } else {
      page = pages[0];
    }
    
    // 設置視窗大小
    await page.setViewport({ width: 1920, height: 1080 });
    console.log(`當前 URL: ${page.url().substring(0, 60)}...\n`);

    // 3. 載入現有群組
    console.log('[3/5] 載入現有群組...');
    loadExistingGroups();
    console.log(`當前群組總數: ${allGroups.size}\n`);

    // 4. 開始搜索
    console.log('[4/5] 開始搜索群組...\n');
    
    let totalNew = 0;
    
    for (let i = 0; i < CONFIG.searchKeywords.length; i++) {
      const keyword = CONFIG.searchKeywords[i];
      console.log(`[${i + 1}/${CONFIG.searchKeywords.length}] 搜索: "${keyword}"`);
      
      try {
        // 導航到搜索頁面
        const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await humanDelay(3000, 5000);
        
        // 滾動頁面以加載更多結果
        for (let scroll = 0; scroll < 3; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 500));
          await humanDelay(1000, 2000);
        }
        
        // 提取群組
        const newGroups = await extractGroups(page);
        const newCount = newGroups.length;
        totalNew += newCount;
        
        if (newCount > 0) {
          console.log(`  ✅ 新增 ${newCount} 個群組 (總計: ${allGroups.size})`);
        } else {
          console.log(`  ⚠️ 未發現新群組`);
        }
        
      } catch (e) {
        console.log(`  ❌ 搜索失敗: ${e.message}`);
      }
      
      // 每搜索5個關鍵詞保存一次
      if ((i + 1) % 5 === 0) {
        saveAllGroups();
        console.log(`  💾 已保存進度\n`);
      }
      
      await humanDelay(2000, 4000);
    }
    
    // 5. 保存最終結果
    console.log('\n[5/5] 保存最終結果...');
    saveAllGroups();
    
    console.log('\n===========================================');
    console.log(' 搜索完成!');
    console.log(` 總群組數: ${allGroups.size}`);
    console.log(` 新增群組: ${totalNew}`);
    console.log('===========================================');
    
    // 截圖記錄
    await page.screenshot({ path: '/tmp/fb_search_complete.png' });
    console.log('\n截圖已保存到 /tmp/fb_search_complete.png');
    
    await browser.disconnect();
    
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.disconnect().catch(() => {});
  }
  
  process.exit(0);
}

main();
