const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

const joined = JSON.parse(fs.readFileSync('./fb_groups_joined_integrated.json', 'utf8'));
const allGroups = [];
for (const cat of Object.values(joined.by_category)) {
  if (cat.groups) allGroups.push(...cat.groups);
}
const log = JSON.parse(fs.readFileSync('./fb_post_log.json', 'utf8'));
const now = Date.now();
const posted = new Set();
for (const p of log.posts) {
  if (p.timestamp && (now - new Date(p.timestamp).getTime()) < 24*60*60*1000) posted.add(p.group_id);
}
const remaining = allGroups.filter(g => !posted.has(g.id));
console.log('未發群組:', remaining.length);

const templates = {
  1: (ai) => `【${ai}】\n🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上\n🔥 港車北上保險首選！¥1469 起！\n永誠保險 — 香港人正規註冊國內保險公司代理人\n✅ 交強險 + 商業第三者責任險 + 醫保外藥用險\n✅ 12次道路救援（拖車、送油、換胎）\n✅ 廣東話/國語雙語服務\n✅ 免費代辦ETC\n全港最平，歡迎 WhatsApp / Wechat 查詢👉🏻\nhttps://api.whatsapp.com/send?phone=85221101144\n📞 94924444\n#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
  2: (ai) => `【${ai}】\n🧐港車北上保險多少錢？\n市場行情參考：\n• 交強險 + 商業第三者責任險 + 醫保外用藥\n✅ 12次道路救援（拖車、送油、換胎）\n• 全套低至 ¥1469 起\n• 另有駕意險可加配\n與香港本地保險比較：\n✅ 性價比更高\n✅ 保障範圍更廣\n✅ 粵/國語雙語服務\n立馬 WhatsApp 比較報價！📱\nhttps://api.whatsapp.com/send?phone=85221101144\n📞 94924444\n#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
  3: (ai) => `【${ai}】\n🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上\n續保預登記享折扣\n• 交強險 + 商業第三者責任險 + 醫保外用藥\n✅ 12次道路救援（拖車、送油、換胎）\n• 全套低至 ¥1469 起\n• 另有駕意險可加配\nWhatsApp 24小時報價👇\nhttps://api.whatsapp.com/send?phone=85221101144\n📞 94924444\n#汽車保險 #保險報價 #續保 #港車北上 #modelS #Tesla #modelY #BYD`
};

const images = ['01.jpeg','02.jpeg','03.jpeg','04.jpeg','05.jpeg'];
const imgDir = '/Users/claw/Desktop/Facebook資料夾/FB_jpeg';

function getAIText() {
  const d = new Date(), w = ['日','一','二','三','四','五','六'];
  const date = `📅 ${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${w[d.getDay()]}`;
  const weather = ['駕駛北上，記得檢查車況，確保行車安全。','路面濕滑，請注意車距，減速慢行。','氣溫上升，長途駕駛請注意防曬和定時休息。','晚間駕駛請開啟車燈，確保安全。'];
  const greet = ['祝你旅途平安！','願您一路順風！','出行順利！'];
  return `${date} ${weather[Math.floor(Math.random()*weather.length)]} ${greet[Math.floor(Math.random()*greet.length)]}`;
}

function savePost(r) {
  const l = JSON.parse(fs.readFileSync('./fb_post_log.json', 'utf8'));
  l.posts.push(r);
  l.total_posts = l.posts.length;
  l.statistics[r.status] = (l.statistics[r.status] || 0) + 1;
  l.last_updated = new Date().toISOString();
  fs.writeFileSync('./fb_post_log.json', JSON.stringify(l, null, 2));
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  if (page.url().includes('login')) { console.log('❌ 未登入'); return; }

  let ok = 0, fail = 0;
  for (let i = 0; i < remaining.length; i++) {
    const g = remaining[i], tmpl = (i % 3) + 1;
    console.log(`[${i+1}/${remaining.length}] ${g.id} (${g.name})`);
    try {
      await page.goto(`https://www.facebook.com/groups/${g.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);

      // Click composer
      let clicked = false;
      for (const t of ['寫點內容','寫點內容......','写点什么','Write something']) {
        if (clicked) break;
        try { const el = page.locator('span', { hasText: t }).first(); if (await el.isVisible({ timeout: 2000 })) { await el.click({ timeout: 5000 }); clicked = true; } } catch(e) {}
        if (!clicked) { clicked = await page.evaluate(t => { for (const s of document.querySelectorAll('span')) { if (s.textContent.includes(t) && s.offsetParent !== null) { s.click(); return true; } } return false; }, t); }
      }
      if (!clicked) { console.log('  ❌ 找不到發文框'); fail++; savePost({ status:'failed', group_id:g.id, group_name:g.name, error:'找不到發文框', timestamp:new Date().toISOString() }); continue; }

      await page.waitForTimeout(3000);

      // Find input in modal
      await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"],[aria-label="建立帖子"],[aria-label="建立公開帖子"]');
        if (d) { const e = d.querySelector('div[contenteditable="true"]'); if (e) { e.focus(); e.click(); } }
      });
      await AntiBot.pause(500, 1000);

      // Upload image first
      const fileInputs = await page.locator('input[type="file"]').all();
      if (fileInputs.length > 0) {
        await fileInputs[fileInputs.length - 1].setInputFiles(`${imgDir}/${images[Math.floor(Math.random()*5)]}`);
        console.log('  📷 圖片已上傳');
        await AntiBot.pause(4000, 6000);
      }

      // Re-focus input after image upload
      await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"],[aria-label="建立帖子"],[aria-label="建立公開帖子"]');
        if (d) { const e = d.querySelector('div[contenteditable="true"]'); if (e) { e.focus(); e.click(); } }
        else {
          const all = document.querySelectorAll('div[contenteditable="true"]');
          let best = null, bestW = 0;
          for (const el of all) { if (el.offsetParent !== null) { const r = el.getBoundingClientRect(); if (r.width > bestW) { best = el; bestW = r.width; } } }
          if (best) { best.focus(); best.click(); }
        }
      });
      await AntiBot.pause(500, 1000);

      // Type content
      const content = templates[tmpl](getAIText());
      await page.keyboard.type(content, { delay: 30 });
      console.log(`  ✏️ 已輸入 ${content.length} 字`);
      await page.waitForTimeout(2000);

      // Click publish
      let pub = await page.evaluate(() => {
        const bs = document.querySelectorAll('div[role="button"], button');
        let bb = null, by = Infinity;
        for (const b of bs) {
          const t = b.textContent.trim();
          if ((t === '發佈' || t === '发布' || t === 'Post') && b.offsetParent !== null) {
            const r = b.getBoundingClientRect();
            if (r.y < by && r.y > 0) { bb = b; by = r.y; }
          }
        }
        if (bb) { bb.click(); return true; }
        return false;
      });
      if (!pub) {
        try { const b = page.locator('div[role="button"]', { hasText: '發佈' }).first(); if (await b.isVisible({ timeout: 2000 })) { await b.click({ force: true }); pub = true; } } catch(e) {}
      }
      if (!pub) await page.keyboard.press('Control+Enter');

      await AntiBot.pause(4000, 6000);

      // Check result
      const gone = await page.evaluate(() => {
        for (const s of document.querySelectorAll('span')) { if (s.textContent.includes('寫點內容') && s.offsetParent !== null) return true; }
        return document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]').length === 0;
      });

      if (pub && gone) { console.log('  ✅ 成功'); ok++; savePost({ status:'success', group_id:g.id, group_name:g.name, content, timestamp:new Date().toISOString() }); }
      else if (pub) { console.log('  ⚠️ 已提交(待審批)'); ok++; savePost({ status:'pending_review', group_id:g.id, group_name:g.name, content, timestamp:new Date().toISOString() }); }
      else { console.log('  ❌ 失敗'); fail++; savePost({ status:'failed', group_id:g.id, group_name:g.name, error:'未能點擊發佈', timestamp:new Date().toISOString() }); }

    } catch(e) { console.log('  ❌ 錯誤:', e.message); fail++; savePost({ status:'failed', group_id:g.id, group_name:g.name, error:e.message, timestamp:new Date().toISOString() }); }

    if (i < remaining.length - 1) { const w = 15000 + Math.random() * 20000; console.log(`  等待 ${(w/1000).toFixed(1)} 秒...`); await new Promise(r => setTimeout(r, w)); }
  }

  console.log(`\n=== 完成 === 成功:${ok} 失敗:${fail}`);
  await browser.close();
})();
