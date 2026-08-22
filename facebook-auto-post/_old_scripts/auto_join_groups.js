/**
 * 自動加入群組腳本
 * 用已存在的登入頁面，逐個群組點擊「加入」
 * 參數: node auto_join_groups.js
 */

const { chromium } = require('playwright');
const fs = require('fs');

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const joinList = JSON.parse(fs.readFileSync('./fb_join_list.json', 'utf8')).groups;
  console.log(`========== 自動加入群組 ==========`);
  console.log(`需加入: ${joinList.length} 個群組\n`);

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  // 找已登入頁面
  let page = null;
  for (const p of context.pages()) {
    if (p.url().includes('facebook.com') && !p.url().includes('login')) {
      page = p;
      break;
    }
  }
  if (!page) {
    console.log('❌ 找不到已登入頁面');
    return;
  }
  console.log(`✅ 使用已登入頁面\n`);

  let joined = 0, already = 0, failed = 0;

  for (let i = 0; i < joinList.length; i++) {
    const group = joinList[i];
    console.log(`[${i + 1}/${joinList.length}] ${group.name} (${group.id})`);

    try {
      await page.goto(`https://www.facebook.com/groups/${group.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);

      if (page.url().includes('login')) {
        console.log(`  ❌ 未登入`);
        failed++;
        continue;
      }

      // 檢查是否已加入
      const joinResult = await page.evaluate(() => {
        // 找「加入群組」或「加入」按鈕
        const buttons = document.querySelectorAll('div[role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent.trim();
          if (text.includes('加入') || text.includes('Join')) {
            if (btn.offsetParent !== null) {
              btn.click();
              return 'clicked';
            }
          }
          if (text === '已加入' || text === 'Joined') {
            return 'already_joined';
          }
        }
        return 'not_found';
      });

      if (joinResult === 'clicked') {
        console.log(`  ✅ 已點擊加入`);
        joined++;
        await wait(2000);
      } else if (joinResult === 'already_joined') {
        console.log(`  ⏭ 已加入`);
        already++;
      } else {
        console.log(`  ❌ 找不到加入按鈕`);
        failed++;
      }

      await wait(2000 + Math.random() * 3000);

    } catch (err) {
      console.log(`  ❌ 錯誤: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n========== 完成 ==========`);
  console.log(`✅ 新加入: ${joined}`);
  console.log(`⏭ 已加入: ${already}`);
  console.log(`❌ 失敗: ${failed}`);
}

main().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
