/**
 * FB 發文 - 完整流程
 */

const puppeteer = require('puppeteer-extra');
const http = require('http');
const fs = require('fs');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('========== FB 自動發文測試 ==========\n');

  // Get WS URL
  const json = await fetchJson('http://127.0.0.1:9222/json/version');
  const browser = await puppeteer.connect({
    browserWSEndpoint: json.webSocketDebuggerUrl,
    ignoreHTTPSErrors: true
  });
  console.log('[1] 已連接 Chrome\n');

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('2580188118918671'));

  if (!page) {
    console.log('❌ 找不到目標群組頁面');
    await browser.disconnect();
    return;
  }
  console.log('[2] 找到群組頁面:', page.url().substring(0, 60), '\n');

  // Wait for page to fully load
  console.log('[3] 等待頁面載入...');
  await page.waitForTimeout(3000);

  // Scroll to top
  console.log('[4] 滾動到頂部...');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // Take debug screenshot
  await page.screenshot({ path: '/tmp/fb_debug_full.png' });
  console.log('截圖: /tmp/fb_debug_full.png\n');

  // Check if there's a post composer
  const pageState = await page.evaluate(() => {
    // Look for the composer
    const composer = document.querySelector('[aria-label*="寫"]') ||
                     document.querySelector('[aria-label*="帖子"]') ||
                     document.querySelector('[aria-label*="建立"]') ||
                     document.querySelector('div.composer') ||
                     document.querySelector('[data-pagelet*="Composer"]');

    // Also try to find any contenteditable
    const editables = document.querySelectorAll('div[contenteditable="true"]');

    return {
      hasComposer: !!composer,
      composerTag: composer?.tagName,
      composerAria: composer?.getAttribute('aria-label'),
      editableCount: editables.length,
      editableTags: Array.from(editables).slice(0, 3).map(e => e.tagName)
    };
  });

  console.log('[5] 頁面狀態:');
  console.log('  - Composer:', pageState.hasComposer ? '✅' : '❌', pageState.composerTag, pageState.composerAria);
  console.log('  - Editable divs:', pageState.editableCount, pageState.editableTags);

  // Try clicking at the top of the page where the composer usually is
  console.log('\n[6] 嘗試點擊打開發文框...');
  await page.mouse.click(700, 300);
  await page.waitForTimeout(2500);

  const editable = await page.$('div[contenteditable="true"]');
  if (editable) {
    console.log('✅ 找到可編輯區域！\n');

    // Type content
    console.log('[7] 輸入內容...');
    await editable.click();

    const aiText = '📅 2026年5月12日 星期二 路面濕滑，請注意車距，減速慢行。祝你旅途平安！';
    await page.keyboard.type(aiText, { delay: 40 });
    console.log('✅ 已輸入標題\n');

    await page.waitForTimeout(1000);

    // Upload image
    console.log('[8] 上傳圖片...');
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles('/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg');
      console.log('✅ 圖片已設定\n');
      await page.waitForTimeout(4000);
    }

    // Click publish
    console.log('[9] 點擊發佈...');
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.innerText?.trim() || '';
        if (text.includes('發佈') || text.includes('分享')) {
          btn.click();
          break;
        }
      }
    });
    console.log('✅ 已點擊發佈\n');

    await page.waitForTimeout(4000);

    // Final screenshot
    await page.screenshot({ path: '/tmp/fb_post_success.png' });
    console.log('最終截圖: /tmp/fb_post_success.png');

    // Update log
    const log = JSON.parse(fs.readFileSync('./fb_post_log.json', 'utf8'));
    log.posts.push({
      id: 'post_' + Date.now(),
      timestamp: new Date().toISOString(),
      group_id: '2580188118918671',
      group_name: '2580188118918671',
      template: 1,
      ai_text: aiText,
      image: '01.jpeg',
      status: 'success',
      note: '測試發文成功'
    });
    log.total_posts = log.posts.length;
    log.statistics.success = (log.statistics.success || 0) + 1;
    log.last_updated = new Date().toISOString();
    fs.writeFileSync('./fb_post_log.json', JSON.stringify(log, null, 2));

    console.log('\n✅ 發文完成！');
  } else {
    console.log('❌ 找不到可編輯區域');
    await page.screenshot({ path: '/tmp/fb_fail_no_editor.png' });

    // Get page HTML for debugging
    const html = await page.content();
    console.log('HTML length:', html.length);
    console.log('Looking for post-related elements...');

    const debug = await page.evaluate(() => {
      const items = document.querySelectorAll('*');
      const found = [];
      for (const item of items) {
        const text = item.innerText || '';
        const aria = item.getAttribute('aria-label') || '';
        if (text.includes('寫點') || aria.includes('寫') || text.includes('建立帖子')) {
          found.push({
            tag: item.tagName,
            text: text.substring(0, 30),
            aria: aria
          });
        }
      }
      return found;
    });

    console.log('Found elements:', JSON.stringify(debug, null, 2));
  }

  await browser.disconnect();
  console.log('\n========== 完成 ==========');
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});