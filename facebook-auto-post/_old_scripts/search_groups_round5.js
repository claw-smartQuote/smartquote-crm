/**
 * Facebook 群組搜索 - 第五輪
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');

const keywords = [
  // 不同關鍵詞組合
  '內地自駕 经验分享',
  '北上開車 注意事項',
  '港車珠海 泊車',
  '中山港車 維修',
  '東莞港車 維修',
  '惠州港車 維修',
  '佛山港車 維修',
  '深圳過關 停車',
  '皇崗口岸 停車',
  '沙頭角口岸 泊車',
  '港車維修 預約',
  '大陸拖車 服務',
  '內地道路救援',
  '跨境車險 索償',
  '港車北上 加油',
  '內地油站 優惠',
  '粵車北上 費用',
  '港車年審 預約',
  '大陸車船稅',
  '交強險 過期',
  '商業險 續保',
  '車損險 玻璃險',
  '劃痕險 保費',
  '自燃險 投保',
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
    await humanDelay(1000, 2000);
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
  console.log(' Facebook 群組搜索 - 第五輪');
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
        for (let s = 0; s < 3; s++) { await page.evaluate(() => window.scrollBy(0, 500)); await humanDelay(1000, 2000); }
        const n = await extractGroups(page);
        totalNew += n.length;
        console.log(n.length > 0 ? ` ✅ +${n.length} (${allGroups.size})` : ' ⚠️ 無');
      } catch (e) { console.log(` ❌ ${e.message.substring(0,30)}`); }
      if ((i + 1) % 5 === 0) saveAllGroups();
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