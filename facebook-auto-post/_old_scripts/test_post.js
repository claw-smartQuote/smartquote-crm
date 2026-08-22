/**
 * FB 自動發文測試 - 使用 Chrome Remote Debugging
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const http = require('http');
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
  console.log('[1] 連接 Chrome...');
  const browser = await puppeteer.connect({
    browserWSEndpoint: json.webSocketDebuggerUrl,
    ignoreHTTPSErrors: true
  });
  console.log('✅ 已連接\n');

  const pages = await browser.pages();
  const targetPage = pages.find(p => p.url().includes('2580188118918671'));

  if (!targetPage) {
    console.log('❌ 找不到目標群組頁面');
    await browser.disconnect();
    process.exit(1);
  }

  console.log('[2] 目標頁面:', targetPage.url());

  // Click to open composer
  console.log('[3] 打開發文框...');
  await targetPage.mouse.click(700, 400);
  await new Promise(r => setTimeout(r, 2500));

  const editable = await targetPage.$('div[contenteditable="true"]');
  if (!editable) {
    console.log('❌ 找不到發文框');
    await targetPage.screenshot({ path: '/tmp/fb_error_no_editor.png' });
    await browser.disconnect();
    process.exit(1);
  }
  console.log('✅ 找到發文框\n');

  // Type content
  console.log('[4] 輸入內容...');
  await editable.click();
  const aiText = '📅 2026年5月12日 星期二 路面濕滑，請注意車距，減速慢行。 祝你旅途平安！';
  const content = `【${aiText}】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 12次道路救援
✅ 廣東話/國語雙語服務
WhatsApp 查詢📱 https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險`;
  await targetPage.keyboard.type(content, { delay: 25 });
  console.log('✅ 已輸入', content.length, '字\n');

  await new Promise(r => setTimeout(r, 1500));

  // Upload image
  console.log('[5] 上傳圖片...');
  const fileInput = await targetPage.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles('/Users/claw/Desktop/Facebook資料夾/FB_jpeg/01.jpeg');
    console.log('✅ 圖片已設定\n');
    await new Promise(r => setTimeout(r, 5000));
  }

  // Click publish
  console.log('[6] 點擊發佈...');
  await targetPage.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.innerText.includes('發佈')) {
        btn.click();
        break;
      }
    }
  });
  console.log('✅ 已點擊發佈\n');

  await new Promise(r => setTimeout(r, 5000));

  // Screenshot
  await targetPage.screenshot({ path: '/tmp/fb_post_result.png' });
  console.log('截圖: /tmp/fb_post_result.png\n');

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

  console.log('✅ 發文完成！');
  await browser.disconnect();
  console.log('\n========== 完成 ==========');
}

main().catch(e => {
  console.error('錯誤:', e.message);
  process.exit(1);
});