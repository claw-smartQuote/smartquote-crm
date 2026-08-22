/**
 * Facebook 港車北上群組自動加入腳本
 * 專門搜索和加入與「港車北上」相關的群組
 * 目標: 50個新群組
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  account: 'to@smartquote.cn',
  password: 'Pin4fb123',
  targetCount: 50,
  joinedFile: path.join(__dirname, 'fb_hk_north_joined.json'),
  storageStateFile: path.join(__dirname, 'fb_storage_state.json'),
  delayBetweenGroups: [6000, 12000],
  delayAfterJoin: [3000, 6000],
};

// 港車北上相關關鍵詞
const SEARCH_KEYWORDS = [
  '港車北上',
  '港車 北上',
  '兩地牌 汽車',
  '兩地車',
  '中港車',
  '粵港車',
  '跨境車',
  '保姆車 北上',
  '七人車 北上',
  'MPV 北上',
  'SUV 北上',
  '港車 保險',
  '汽車保險 北上',
  '大灣區 車主',
  '香港司機 內地',
  '珠海 北上',
  '深圳 北上',
  '广州 北上',
  '內地自駕 港車',
  '港人 內地駕駛',
  '中港 車牌',
  '大陸 駕照',
  '車險 北上',
];

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('zh-HK')}] ${msg}`);
}

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function getJoined() {
  const data = loadJson(CONFIG.joinedFile) || { groups: [], startedAt: null };
  return data;
}

function addJoined(groupId, groupName, status) {
  const data = getJoined();
  if (!data.groups.find(g => g.id === groupId)) {
    data.groups.push({ id: groupId, name: groupName, status, joinedAt: new Date().toISOString() });
    data.startedAt = data.startedAt || new Date().toISOString();
    saveJson(CONFIG.joinedFile, data);
  }
}

async function main() {
  const joinedData = getJoined();
  console.log(`
========================================
  港車北上群組自動加入工具
  目標: ${CONFIG.targetCount} 個群組
  已加入: ${joinedData.groups.length} 個
========================================
`);

  // 啟動瀏覽器
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // 嘗試使用已保存的 session
  if (fs.existsSync(CONFIG.storageStateFile)) {
    log('使用已保存的登入狀態...');
    contextOptions.storageState = CONFIG.storageStateFile;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // 登入
  if (!fs.existsSync(CONFIG.storageStateFile)) {
    log('正在打開 Facebook 登入頁...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
    
    const url = page.url();
    if (url.includes('login')) {
      log('填寫登入資料...');
      await page.fill('input[name="email"]', CONFIG.account);
      await randomDelay(300, 800);
      await page.fill('input[name="pass"]', CONFIG.password);
      await randomDelay(300, 800);
      await page.click('button[name="login"]');
      await page.waitForURL('**/facebook.com/**', { timeout: 15000 });
      log('✅ 登入成功！');
    } else {
      log('已登入！');
    }
    
    // 保存登入狀態
    await context.storageState({ path: CONFIG.storageStateFile });
    log('已保存登入狀態');
  } else {
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 20000 });
    log('✅ 已使用保存狀態登入！');
  }

  let totalJoined = getJoined().groups.length;

  for (let ki = 0; ki < SEARCH_KEYWORDS.length && totalJoined < CONFIG.targetCount; ki++) {
    const keyword = SEARCH_KEYWORDS[ki];
    const before = getJoined().groups.length;

    log(`\n搜索關鍵詞 [${ki + 1}/${SEARCH_KEYWORDS.length}]: "${keyword}"`);

    try {
      const searchUrl = `https://www.facebook.com/search/groups?q=${encodeURIComponent(keyword)}&epa=SEARCH_BOX`;
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await randomDelay(2000, 4000);

      // 滾動頁面
      for (let s = 0; s < 3; s++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await randomDelay(1000, 2000);
      }

      // 收集群組連結
      const groups = await page.$$eval('a[href*="/groups/"]', links => {
        const seen = new Set();
        return links
          .map(a => {
            const match = a.href.match(/\/groups\/([a-zA-Z0-9]+)/);
            if (match && !seen.has(match[1])) {
              seen.add(match[1]);
              return { id: match[1], name: a.textContent.trim(), href: a.href };
            }
          })
          .filter(g => g && g.id && g.name.length > 2 && g.name.length < 150);
      });

      log(`  找到 ${groups.length} 個群組`);

      for (const group of groups) {
        if (getJoined().groups.length >= CONFIG.targetCount) {
          log('已達到目標！');
          break;
        }
        if (getJoined().groups.find(g => g.id === group.id)) {
          continue;
        }

        try {
          log(`  加入: ${group.name}`);
          await page.goto(group.href, { waitUntil: 'networkidle', timeout: 15000 });
          await randomDelay(1500, 3000);

          // 嘗試多個加入按鈕選擇器
          const btnSelectors = [
            'div[aria-label*="加入"]',
            'div[data-ad-preview="message"]',
            'span:text("加入群組")',
            'div:text("加入群組")',
            'div:text-is("加入群組")',
            'button:text("加入")',
          ];

          let joined = false;
          for (const sel of btnSelectors) {
            try {
              const btn = await page.waitForSelector(sel, { timeout: 3000 });
              if (btn) {
                await btn.scrollIntoViewIfNeeded();
                await btn.click();
                joined = true;
                log(`    ✅ 加入成功`);
                break;
              }
            } catch {}
          }

          if (!joined) {
            log(`    ⚠️ 未找到加入按鈕`);
          }

          addJoined(group.id, group.name, joined ? 'joined' : 'no_button');
          totalJoined = getJoined().groups.length;
          log(`    進度: ${totalJoined}/${CONFIG.targetCount}`);

          await randomDelay(...CONFIG.delayAfterJoin);

        } catch (e) {
          log(`    ❌ 錯誤: ${e.message.slice(0, 80)}`);
        }

        await randomDelay(...CONFIG.delayBetweenGroups);
      }

    } catch (e) {
      log(`  搜索失敗: ${e.message.slice(0, 100)}`);
    }

    const after = getJoined().groups.length;
    log(`關鍵詞 "${keyword}" 完成 (+${after - before} 群組)`);

    if (ki < SEARCH_KEYWORDS.length - 1 && totalJoined < CONFIG.targetCount) {
      await randomDelay(8000, 15000);
    }
  }

  const final = getJoined();
  console.log(`
========================================
  完成！
  共加入: ${final.groups.length} 個群組
  目標: ${CONFIG.targetCount}
========================================
`);
  console.log('最近加入的群組:');
  final.groups.slice(-10).forEach(g => console.log(`  - ${g.name} (${g.id})`));

  await browser.close();
}

main().catch(e => {
  console.error('腳本錯誤:', e);
  process.exit(1);
});
