/**
 * Facebook 群組搜索 - 第七輪 (更精確關鍵詞)
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');

const keywords = [
  // 精確品牌+車型
  'Toyota Alphard 保險',
  'Toyota Vellfire 保險',
  'Toyota埃尔法 北上',
  'Lexus LM 保險',
  'Mercedes Vito 北上',
  'BMW 5系 北上',
  'Audi A6 北上',
  'Volkswagen Golf 保險',
  'Mazda CX-30 保險',
  'Honda Stepwgn 北上',
  
  // 特定主題
  '司機互助 北上',
  '道路救援 珠三角',
  '粵港車主 交流',
  '兩地車牌 經驗',
  '內地泊車 攻略',
  '珠海長隆 自駕',
  '迪士尼 自駕遊',
  '廣州塔 自駕',
  '深圳灣 過關',
  '蓮塘口岸 泊車',
  
  // 更多車型
  'Tesla Model X 保險',
  'Tesla Model S 保險',
  'BYD Han 保險',
  'BYD Seal 評測',
  'Porsche Taycan 保險',
  'Mercedes EQS 保險',
  'BMW iX3 保險',
  'Audi e-tron 保險',
  
  // 保險相關
  '汽車保險 索償',
  '保險經紀 汽車',
  '兩地車 哪家保險好',
  '永誠保險 評價',
  '港車北上 哪家保險',
  '汽車保險 香港內地',
];

const CONFIG = { outputFile: './target_groups_clean.json' };
let allGroups = new Map();

function loadExistingGroups() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
    data.groups.forEach(g => allGroups.set(g.id, g));
    console.log(`已載入 ${allGroups.size} 個群組`);
  } catch (e) { console.log('載入失敗:', e.message); }
}

function saveAllGroups() {
  const groups = Array.from(allGroups.values());
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify({
    description: 'Facebook自動發文目標群組列表',
    account: '萊to@smartquote.cn',
    total_unique_groups: groups.length,
    last_updated: new Date().toISOString().split('T')[0],
    groups: groups,
  }, null, 2, 'utf8'));
}

async function humanDelay(min, max) {
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));
}

async function extractGroups(page) {
  const newGroups = [];
  try {
    await page.waitForSelector('[href*="/groups/"]', { timeout: 3000 }).catch(() => {});
    await humanDelay(1500, 2500);
    const groupLinks = await page.$$eval('a[href*="/groups/"]', links => links.map(link => {
      const href = link.href;
      const match = href.match(/\/groups\/(\d+)/);
      return match ? { id: match[1], url: href.split('?')[0], name: link.textContent?.trim().substring(0, 100) || match[1] } : null;
    }).filter(Boolean));
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
  console.log(' Facebook 群組搜索 - 第七輪');
  console.log('===========================================\n');

  let browser = null;
  try {
    console.log('[1/4] 連接 Chrome...');
    const versionData = await fetch('http://127.0.0.1:9222/json/version');
    const versionJson = await versionData.json();
    browser = await puppeteer.connect({ browserWSEndpoint: versionJson.webSocketDebuggerUrl, ignoreHTTPSErrors: true });
    console.log('✅ 已連接\n');

    let page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('[2/4] 載入現有...');
    loadExistingGroups();
    console.log('');

    console.log('[3/4] 搜索...\n');
    let totalNew = 0;

    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      process.stdout.write(`[${i + 1}/${keywords.length}] "${kw}"`);
      try {
        await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(kw)}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await humanDelay(3000, 5000);
        for (let s = 0; s < 3; s++) { 
          await page.evaluate(() => window.scrollBy(0, 500)); 
          await humanDelay(1000, 2000); 
        }
        const n = await extractGroups(page);
        totalNew += n.length;
        console.log(n.length > 0 ? ` ✅ +${n.length} (${allGroups.size})` : ' ⚠️ 無');
      } catch (e) { console.log(` ❌ ${e.message.substring(0,30)}`); }
      if ((i + 1) % 5 === 0) { saveAllGroups(); console.log(''); }
      await humanDelay(2000, 4000);
    }

    saveAllGroups();
    console.log('\n===========================================');
    console.log(` 完成! 總: ${allGroups.size}, 新增: ${totalNew}`);
    console.log('===========================================');
    await browser.disconnect();
  } catch (e) { console.error('❌', e.message); if (browser) await browser.disconnect(); }
  process.exit(0);
}

main();