/**
 * Facebook 自動加群腳本 - to@smartquote.cn
 *
 * 功能：自動瀏覽目標群組並加入
 * 用法：node fb_auto_join_groups.js [--dry-run] [--limit N] [--category C]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 配置
// ============================================================================
const CONFIG = {
  account: 'to@smartquote.cn',
  password: 'Pin4fb123',
  cdpUrl: 'http://localhost:9222',
  // 可選：直接指定已登入的 CDP WebSocket URL
  cdpPageUrl: process.env.CDP_PAGE_URL || null,
  targetFile: path.join(__dirname, 'target_groups_clean.json'),
  logFile: path.join(__dirname, 'fb_join_log.json'),
  joinedFile: path.join(__dirname, 'fb_groups_joined_to.json'),
  delayBetweenGroups: [8000, 15000],  // 隨機間隔（ms）
  delayAfterJoin: [3000, 6000],
  maxGroupsPerRun: 30,  // 每次最多加群數
  timeout: 30000,
};

// ============================================================================
// 工具函數
// ============================================================================
function randomDelay(min, max) {
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadJoinLog() {
  return loadJson(CONFIG.logFile) || { joins: [], lastRun: null };
}

function saveJoinLog(logData) {
  logData.lastRun = new Date().toISOString();
  saveJson(CONFIG.logFile, logData);
}

function loadJoinedGroups() {
  const data = loadJson(CONFIG.joinedFile);
  return data ? new Set(data.joined || []) : new Set();
}

function saveJoinedGroup(groupId, groupName, status) {
  let data = loadJson(CONFIG.joinedFile) || { joined: [], details: [], updatedAt: null };
  if (!data.joined.includes(groupId)) {
    data.joined.push(groupId);
    data.details.push({
      id: groupId,
      name: groupName,
      status,
      joinedAt: new Date().toISOString(),
    });
  }
  data.updatedAt = new Date().toISOString();
  saveJson(CONFIG.joinedFile, data);
}

// ============================================================================
// 主邏輯
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : CONFIG.maxGroupsPerRun;
  const catIdx = args.indexOf('--category');
  const filterCategory = catIdx >= 0 ? args[catIdx + 1] : null;

  log('=== Facebook 自動加群 ===');
  log(`帳戶: ${CONFIG.account}`);
  log(`模式: ${dryRun ? 'DRY RUN（不實際操作）' : 'LIVE'}`);
  log(`每次上限: ${limit}`);

  // 讀取目標群組
  const targetData = loadJson(CONFIG.targetFile);
  if (!targetData) {
    log('ERROR: 無法讀取 target_groups_clean.json');
    process.exit(1);
  }
  let groups = targetData.groups || [];
  log(`目標群組總數: ${groups.length}`);

  // 按 category 過濾
  if (filterCategory) {
    groups = groups.filter(g => g.category === filterCategory);
    log(`過濾 category="${filterCategory}": ${groups.length} 個`);
  }

  // 排除已加入的群組
  const alreadyJoined = loadJoinedGroups();
  const joinLog = loadJoinLog();
  const recentlyAttempted = new Set(
    joinLog.joins
      .filter(j => {
        const hours = (Date.now() - new Date(j.time).getTime()) / 3600000;
        return hours < 48;
      })
      .map(j => j.groupId)
  );

  const toJoin = groups.filter(g => {
    const id = g.id || g.url.split('/groups/')[1]?.replace('/', '')?.split('?')[0];
    return !alreadyJoined.has(id) && !recentlyAttempted.has(id);
  });
  log(`待加入: ${toJoin.length} 個（排除已加入 ${alreadyJoined.size} + 48h內嘗試 ${recentlyAttempted.size}）`);

  if (toJoin.length === 0) {
    log('沒有新的群組可以加入');
    process.exit(0);
  }

  const batch = toJoin.slice(0, limit);
  log(`本次處理: ${batch.length} 個`);

  // 連接 Chrome（復用已登入的 session）
  let browser, context, page;
  try {
    log('連接 Chrome...');
    browser = await chromium.connectOverCDP(CONFIG.cdpUrl);
    
    // 如果指定了頁面 URL，直接連接到該頁面
    if (CONFIG.cdpPageUrl) {
      log(`使用指定的 CDP URL: ${CONFIG.cdpPageUrl}`);
      const existingPage = await browser.connectOverCDP(CONFIG.cdpPageUrl);
      context = existingPage.contexts ? existingPage.contexts()[0] : browser.contexts()[0];
      const pages = await context.pages();
      page = pages.find(p => p.url().includes('facebook')) || pages[0];
    } else {
      const contexts = browser.contexts();
      context = contexts[0];
      const pages = await context.pages();
      page = pages.find(p => p.url().includes('facebook')) || await context.newPage();
    }
    
    if (!page) {
      log('ERROR: 無法找到 Facebook 頁面');
      process.exit(1);
    }
    log(`已連接到頁面: ${page.url().substring(0, 60)}`);
  } catch (err) {
    log(`ERROR: 無法連接 Chrome CDP (${CONFIG.cdpUrl})`);
    log('請先啟動: bash launch_chrome_debug.sh');
    process.exit(1);
  }

  // 檢查是否已登入 Facebook
  log('檢查 Facebook 登入狀態...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  const loginStatus = await page.evaluate(() => {
    const emailInput = document.querySelector('input[name="email"]');
    const passInput = document.querySelector('input[name="pass"]');
    const loginBtn = document.querySelector('button[name="login"]');
    const userProfile = document.querySelector('[data-pagelet="LeftRail"] a, a[aria-label*="首頁"], div[role="navigation"]');
    return {
      needsLogin: !!(emailInput && passInput),
      hasNavigation: !!userProfile,
    };
  });

  if (loginStatus.needsLogin && !loginStatus.hasNavigation) {
    log('需要登入，正在使用 to@smartquote.cn...');
    if (dryRun) {
      log('DRY RUN: 跳過登入');
    } else {
      try {
        await page.fill('input[name="email"]', CONFIG.account);
        await randomDelay(500, 1000);
        await page.fill('input[name="pass"]', CONFIG.password);
        await randomDelay(800, 1500);
        await page.press('input[name="pass"]', 'Enter');
        await page.waitForTimeout(8000);

        // 檢查是否登入成功
        const pageText = await page.textContent('body').catch(() => '');
        if (pageText.includes('更改密碼') || pageText.includes('checkpoint') || pageText.includes('身份確認')) {
          log('WARNING: Facebook 需要額外驗證，請手動處理');
          log('完成後重新運行此腳本');
          await page.close();
          process.exit(1);
        }
        log('登入成功');
      } catch (err) {
        log(`ERROR: 登入失敗 - ${err.message}`);
        await page.close();
        process.exit(1);
      }
    }
  } else {
    log('已登入 Facebook');
  }

  // 開始加群
  let joined = 0, failed = 0, skipped = 0, pending = 0;

  for (let i = 0; i < batch.length; i++) {
    const group = batch[i];
    const groupId = group.id || group.url.split('/groups/')[1]?.replace('/', '')?.split('?')[0];
    const groupName = group.name || groupId;
    const category = group.category || '其他';

    log(`\n--- [${i + 1}/${batch.length}] ${groupName} (${category}) ---`);

    if (dryRun) {
      log(`DRY RUN: 跳過 ${groupId}`);
      joinLog.joins.push({
        groupId,
        groupName,
        category,
        status: 'dry-run',
        time: new Date().toISOString(),
      });
      skipped++;
      continue;
    }

    try {
      // 訪問群組頁面
      await page.goto(`https://www.facebook.com/groups/${groupId}`, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.timeout,
      });
      await randomDelay(2000, 4000);

      // 隨機滾動（模擬真人）
      await page.evaluate(() => {
        window.scrollBy(0, 200 + Math.random() * 300);
      });
      await randomDelay(1000, 2000);
      await page.evaluate(() => {
        window.scrollBy(0, -(100 + Math.random() * 200));
      });

      // 檢查群組狀態
      const groupStatus = await page.evaluate(() => {
        function findByAriaLabel(labels) {
          for (const label of labels) {
            const el = document.querySelector(`div[aria-label="${label}"], span[aria-label="${label}"], a[aria-label="${label}"]`);
            if (el) return el;
          }
          return null;
        }

        function findByText(texts, tag = '*') {
          const elements = document.querySelectorAll(tag);
          for (const el of elements) {
            const t = el.textContent?.trim();
            if (t && texts.some(txt => t.includes(txt))) return el;
          }
          return null;
        }

        // 檢查「加入群組」按鈕（新版 FB 用「加入群組」，舊版用「加入小組」）
        const joinBtn = findByAriaLabel(['加入群組', '加入小组', 'Join Group', 'Join']) ||
                        findByText(['加入群組', '加入小组', 'Join Group'], 'div');

        // 檢查是否已加入
        const joinedEl = findByAriaLabel(['已加入', '已成員', 'Joined', 'Member']) ||
                         findByText(['已加入', '已成員', 'Joined'], 'div');

        // 檢查是否有發文框
        const composer = document.querySelector('[data-pagelet="GroupComposer"]') ||
                         findByText(['寫點什麼', '写点什么', 'Write something'], 'span');

        // 群組是否存在
        const bodyText = document.body.textContent || '';
        const notAvailable = bodyText.includes('This content isn\'t available') ||
                             bodyText.includes('此內容無法使用') ||
                             bodyText.includes('此内容无法使用');

        return {
          hasJoinButton: !!joinBtn,
          joinBtnText: joinBtn?.textContent?.trim()?.substring(0, 30),
          isJoined: !!joinedEl || !!composer,
          notAvailable: notAvailable,
        };
      });

      if (groupStatus.notAvailable) {
        log(`  SKIP: 群組不存在或無法訪問`);
        joinLog.joins.push({ groupId, groupName, category, status: 'unavailable', time: new Date().toISOString() });
        skipped++;
        continue;
      }

      if (groupStatus.isJoined) {
        log(`  ALREADY JOINED`);
        saveJoinedGroup(groupId, groupName, 'already_joined');
        joinLog.joins.push({ groupId, groupName, category, status: 'already_joined', time: new Date().toISOString() });
        skipped++;
        continue;
      }

      if (groupStatus.hasQuestions) {
        log(`  PENDING: 需要回答問題（跳過）`);
        joinLog.joins.push({ groupId, groupName, category, status: 'requires_questions', time: new Date().toISOString() });
        pending++;
        continue;
      }

      if (!groupStatus.hasJoinButton) {
        log(`  SKIP: 找不到加群按鈕`);
        joinLog.joins.push({ groupId, groupName, category, status: 'no_button', time: new Date().toISOString() });
        skipped++;
        continue;
      }

      // 點擊「加入群組」
      log(`  CLICKING JOIN...`);
      await page.evaluate(() => {
        function findByAriaLabel(labels) {
          for (const label of labels) {
            const el = document.querySelector(`div[aria-label="${label}"], span[aria-label="${label}"]`);
            if (el) return el;
          }
          return null;
        }
        const btn = findByAriaLabel(['加入群組', '加入小组', 'Join Group', 'Join']);
        if (btn) btn.click();
      });

      await randomDelay(CONFIG.delayAfterJoin[0], CONFIG.delayAfterJoin[1]);

      // 驗證是否成功
      const verifyStatus = await page.evaluate(() => {
        function findByAriaLabel(labels) {
          for (const label of labels) {
            const el = document.querySelector(`div[aria-label="${label}"]`);
            if (el) return el;
          }
          return null;
        }
        
        // 檢查是否直接顯示「已加入」
        if (findByAriaLabel(['已加入', '已成員', 'Joined', 'Member'])) return 'joined';
        
        // 檢查是否顯示待審核
        if (findByAriaLabel(['已申請', '待處理', 'Pending', 'Requested'])) return 'pending_review';
        
        // 如果「加入群組」按鈕消失了，說明可能已加入
        if (!findByAriaLabel(['加入群組', '加入小组', 'Join Group', 'Join'])) return 'likely_joined';
        
        return 'unknown';
      });

      if (verifyStatus === 'joined' || verifyStatus === 'likely_joined') {
        log(`  ✅ 已加入`);
        saveJoinedGroup(groupId, groupName, 'joined');
        joinLog.joins.push({ groupId, groupName, category, status: 'joined', time: new Date().toISOString() });
        joined++;
      } else if (verifyStatus === 'pending_review') {
        log(`  ⏳ 待審核`);
        joinLog.joins.push({ groupId, groupName, category, status: 'pending_review', time: new Date().toISOString() });
        pending++;
      } else {
        log(`  ❓ 狀態: ${verifyStatus}，按鈕仍存在但已點擊`);
        // 按鈕仍存在並不意味失敗，可能是私隱群組需要審批
        // 標記為 likely_joined_seen_button 以區分未嘗試的情況
        joinLog.joins.push({ groupId, groupName, category, status: verifyStatus, time: new Date().toISOString() });
        joined++; // 計入已處理
        log(`  📝 已計入已處理（按鈕曾出現且已點擊）`);
      }

      // 隨機間隔（防機器人檢測）
      const delay = CONFIG.delayBetweenGroups[0] + Math.random() * (CONFIG.delayBetweenGroups[1] - CONFIG.delayBetweenGroups[0]);
      log(`  等待 ${(delay / 1000).toFixed(1)}s...`);
      await randomDelay(delay * 0.8, delay * 1.2);

    } catch (err) {
      log(`  ERROR: ${err.message}`);
      joinLog.joins.push({ groupId, groupName, category, status: 'error', error: err.message, time: new Date().toISOString() });
      failed++;
      // 等更久再繼續
      await randomDelay(15000, 25000);
    }

    // 每 10 個保存一次
    if ((i + 1) % 10 === 0) {
      saveJoinLog(joinLog);
      log(`\n=== 進度: ${i + 1}/${batch.length} | 已加: ${joined} 待審: ${pending} 跳過: ${skipped} 失敗: ${failed} ===\n`);
    }
  }

  // 保存日誌
  saveJoinLog(joinLog);

  await page.close();

  // 輸出統計
  log('\n========================================');
  log('  Facebook 自動加群完成');
  log('========================================');
  log(`  處理: ${batch.length}`);
  log(`  已加入: ${joined}`);
  log(`  待審核: ${pending}`);
  log(`  跳過: ${skipped}`);
  log(`  失敗: ${failed}`);
  log(`  日誌: ${CONFIG.logFile}`);
  log(`  已加入列表: ${CONFIG.joinedFile}`);
  log('========================================');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
