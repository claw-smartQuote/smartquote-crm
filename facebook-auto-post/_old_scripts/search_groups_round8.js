/**
 * Facebook 群組搜索 - 第八輪 (精確關鍵詞)
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');

const keywords = [
  // 保姆車/七人車
  'Toyota Alphard 車主',
  'Toyota Vellfire 車主',
  'Lexus LM 車主',
  'Mercedes Vito 車主',
  'VW T6 車主',
  
  // 電動車主
  'Tesla Model Y 車主',
  'Tesla Model 3 車主',
  'BYD Seal 車主',
  'BYD Dolphin 車主',
  'BYD Atto3 車主',
  
  // 豪車車主
  ' Porsche 車主',
  'BMW 車主',
  'Mercedes-Benz 車主',
  'Audi 車主',
  'Lexus 車主',
  
  // 特定城市
  '深圳 港車',
  '廣州 港車',
  '珠海 港車',
  '東莞 港車',
  '惠州 港車',
  
  // 汽車討論
  'MPV 車主',
  'SUV 車主',
  '轎車 車主',
  '跑車 車主',
  '掀背車 車主',
];

const CONFIG = { outputFile: './target_groups_clean.json' };
let allGroups = new Map();

function loadExistingGroups() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
    data.groups.forEach(g => allGroups.set(g.id, g));
    console.log(`已載入 ${allGroups.size} 個群組`);
  } catch (e) { console.log('載入失敗'); }
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
  console.log(' Facebook 群組搜索 - 第八輪');
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