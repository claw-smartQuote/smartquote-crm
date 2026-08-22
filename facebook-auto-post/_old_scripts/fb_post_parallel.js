/**
 * Facebook 自動發文 - 並行發文版
 * 
 * 流程：
 * 1. 連接已登入的 Chrome (保持舊 session)
 * 2. 2個群組並行發文
 * 3. 完成後再做下一批
 * 4. 加入小組 → 寫點什麼 → AI發文 → 加圖片 → 發佈 → 刪除分頁
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
  parallelCount: 1,  // 每次1個群組
};

function loadPostLog() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.postLogFile, 'utf8'));
  } catch {
    return { posts: [], statistics: { success: 0, pending_review: 0, requires_question: 0, failed: 0 } };
  }
}

function savePostLog(log) {
  fs.writeFileSync(CONFIG.postLogFile, JSON.stringify(log, null, 2));
}

function addPostRecord(post) {
  const log = loadPostLog();
  log.posts.push(post);
  log.total_posts = log.posts.length;
  log.statistics[post.status] = (log.statistics[post.status] || 0) + 1;
  log.last_updated = new Date().toISOString();
  savePostLog(log);
}

function hasAlreadyPosted(groupId) {
  const log = loadPostLog();
  const now = Date.now();
  return log.posts.some(p => 
    p.group_id === groupId && 
    (now - new Date(p.timestamp).getTime()) < 24 * 60 * 60 * 1000
  );
}

function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

function getAIText() {
  const dates = ['📅 2026年4月27日 星期一'];
  const weather = [
    '駕駛北上，記得檢查車況，確保行車安全。',
    '路面濕滑，請注意車距，減速慢行。',
    '氣溫上升，長途駕駛請注意防曬和定時休息。',
    '晚間駕駛請開啟車燈，確保安全。',
  ];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dates[0]} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
}

function getTemplate(num, aiText) {
  const templates = {
    1: `【${aiText}】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・營業車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 醫保外藥用險
✅ 12次道路救援（拖車、送油、換胎）
✅ 廣東話/國語雙語服務
✅ 免費代辦ETC
全港最平，歡迎 WhatsApp / Wechat 查詢👉🏻
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`,
    2: `【${aiText}】
🔥 港車北上保險 | 節省保費首選！
永誠保險 — 正規註冊國內保險公司
✅ 交強險 + 商業第三者責任險 + 醫保外藥用險
✅ 12次道路救援服務（拖車、送油、換胎）
✅ 廣東話/國語雙語服務
✅ 免費代辦ETC
全港最平・歡迎 WhatsApp 查詢👉🏻
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #保費 #續保 #Tesla #modelY #BYD`,
    3: `【${aiText}】
🚗 汽車保險・港車北上・珠三角行車
永誠保險 — 香港人正規註冊國內保險公司
🔥 港車北上保險首選！¥1469 起！
✅ 交強險 + 商業險 + 醫保外藥用險
✅ 12次道路救援 | 廣東話/國語服務
✅ 免費代辦ETC
全港最平！WhatsApp / Wechat 查詢👉🏻
https://api.whatsapp.com/send?phone=85221101144
📞 94924444
#港車北上 #汽車保險 #Tesla #modelY #BYD`
  };
  return templates[num] || templates[1];
}

async function postToGroup(page, group, templateNum) {
  const result = { group_id: group.id, group_name: group.name, timestamp: new Date().toISOString(), status: 'unknown' };
  
  try {
    console.log(`[DEBUG] 準備發文到: ${group.id}`);
    
    // 1. 進入群組
    await page.goto(`https://www.facebook.com/groups/${group.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // 2. 確認登入
    if (page.url().includes('login')) {
      console.log(`❌ 未登入`);
      result.status = 'login_failed';
      return result;
    }
    console.log(`[DEBUG] 已進入群組`);
    
    // 3. 點擊「加入小組」按鈕（如果需要）
    const joinButton = page.locator('div[aria-label="加入小組"], div[aria-label="Join"]').first();
    if (await joinButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[DEBUG] 點擊加入小組...');
      await joinButton.click();
      await page.waitForTimeout(2000);
    }
    
    // 4. 點擊「寫點什麼...」按鈕
    console.log('[DEBUG] 點擊發文框...');
    const writeBtnSelectors = [
      'div[role="button"]:has-text("寫點什麼")',
      'div[role="button"]:has-text("写点什么")',
      'div[role="button"][aria-label*="寫點"]',
      'div[role="button"][aria-label*="写点什么"]',
      'span[aria-label*="寫點什麼"]',
      'span[aria-label*="写点什么"]',
      'div[aria-label*="寫點什麼"]',
      'div[data-ad-preview="message"]',
      'div[role="presentation"]'
    ];
    
    let inputClicked = false;
    for (const selector of writeBtnSelectors) {
      try {
        const elem = page.locator(selector).first();
        if (await elem.count() > 0 && await elem.isVisible()) {
          await elem.click();
          inputClicked = true;
          console.log(`[DEBUG] 已點擊: ${selector}`);
          break;
        }
      } catch {}
    }
    
    if (!inputClicked) {
      console.log('[DEBUG] 找不到發文框');
    }
    
    // 等待對話框出現
    await page.waitForTimeout(1500);
    
    // 6. 輸入文字 - 在對話框內找文字輸入框
    console.log('[DEBUG] 輸入文字...');
    const aiText = getAIText();
    const content = getTemplate(templateNum, aiText);
    
    // 嘗試直接使用 textarea
    const textarea = page.locator('textarea[aria-label="发布公开帖…"]').first();
    if (await textarea.count() > 0) {
      await textarea.fill(content);
      console.log('[DEBUG] 已輸入文字 via textarea');
    } else {
      // 備用：直接鍵盤輸入
      await page.keyboard.type(content, { delay: 20 });
      console.log('[DEBUG] 已用 keyboard 輸入文字');
    }
    
    await page.waitForTimeout(800);
    
    // 7. 加入圖片
    console.log('[DEBUG] 加入圖片...');
    const imagePath = getRandomImage();
    let photoAdded = false;
    
    // 點擊照片按鈕
    const photoBtn = page.locator('div[aria-label="照片/视频"]').first();
    if (await photoBtn.count() > 0) {
      await photoBtn.click({ force: true });
      console.log('[DEBUG] 已點擊照片按鈕');
      await page.waitForTimeout(800);
      
      // 上傳文件
      const fileInput = page.locator('input[type="file"]').last();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(imagePath);
        photoAdded = true;
        console.log('[DEBUG] 已選擇圖片');
        await page.waitForTimeout(2500);
      }
    } else {
      console.log('[DEBUG] 未找到加圖片按鈕，跳過');
    }
    
    await page.waitForTimeout(500);
    
    // 8. 發佈
    let published = false;
    console.log('[DEBUG] 點擊發布...');
    const publishBtn = page.locator('div[aria-label="发布"]').first();
    if (await publishBtn.count() > 0) {
      await publishBtn.click({ force: true });
      console.log('[DEBUG] 已點擊發布');
      published = true;
    } else {
      console.log('[DEBUG] 未找到發布按鈕');
    }
    
    await page.waitForTimeout(2000);
    
    // 9. 檢查發佈狀態
    // 如果有圖片且點擊了發布，或找到了成功標記，就算成功
    const successSelectors = [
      'div[aria-label="成功"]', 
      'div[aria-label="Success"]', 
      'span:has-text("成功")',
      'div[role="status"]'
    ];
    
    let foundSuccess = false;
    for (const selector of successSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 500 })) {
          foundSuccess = true;
          break;
        }
      } catch {}
    }
    
    // 有圖片+發布 或 找到成功標記 = 成功
    if ((photoAdded && published) || foundSuccess) {
      result.status = 'success';
      console.log('[DEBUG] 狀態: success');
    } else if (published) {
      // 沒圖片但有發布也算成功
      result.status = 'success';
      console.log('[DEBUG] 狀態: success');
    } else {
      result.status = 'failed';
      console.log('[DEBUG] 狀態: failed');
    }
    
    // 10. 關閉分頁
    console.log('[DEBUG] 分頁已關閉');
    
  } catch (err) {
    console.log(`[DEBUG] 錯誤: ${err.message}`);
    result.status = 'failed';
  }
  
  return result;
}

async function main() {
  let browser;
  let sharedContext;
  
  try {
    // 連接 Chrome
    console.log('[DEBUG] 連接 Chrome...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('[DEBUG] 已連接 Chrome');
    
    // 確認已登入
    const testCtx = await browser.newContext();
    const testPage = await testCtx.newPage();
    await testPage.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await testPage.waitForTimeout(2000);
    if (testPage.url().includes('login')) {
      console.log('❌ Chrome 未登入');
      await testPage.close();
      await testCtx.close();
      return;
    }
    console.log('[DEBUG] Chrome 已登入確認');
    await testPage.close();
    await testCtx.close();
    
    // 取得 shared context
    const contexts = browser.contexts();
    sharedContext = contexts[0];
    console.log(`[DEBUG] Shared context 已取得`);
    
    // 從第100個群組開始（避開已發文的）
    const startIdx = 100;
    const targetGroups = CONFIG.groups.slice(startIdx, startIdx + 50);  // 50個群組
    console.log(`\n========== 準備發文到 ${targetGroups.length} 個群組（每次${CONFIG.parallelCount}個並行）==========\n`);
    
    // 模板輪換
    let templateIdx = 0;
    const templates = [1, 2, 3];
    
    for (let i = 0; i < targetGroups.length; i += CONFIG.parallelCount) {
      // 準備這一批群組
      const batch = [];
      for (let j = 0; j < CONFIG.parallelCount && (i + j) < targetGroups.length; j++) {
        batch.push({
          group: targetGroups[i + j],
          templateNum: templates[templateIdx % templates.length]
        });
        templateIdx++;
      }
      
      console.log(`\n========== 第 ${Math.floor(i / CONFIG.parallelCount) + 1} 批 ${batch.length} 個群組 ==========`);
      
      // 並行發文
      const promises = batch.map(item => {
        return new Promise(async (resolve) => {
          try {
            const page = await sharedContext.newPage();
            const result = await postToGroup(page, item.group, item.templateNum);
            addPostRecord(result);
            console.log(`[DEBUG] ${item.group.name}: ${result.status}`);
            await page.close();
            resolve(result);
          } catch (err) {
            console.log(`[ERROR] ${item.group.name}: ${err.message}`);
            resolve({ group_id: item.group.id, status: 'failed' });
          }
        });
      });
      
      await Promise.all(promises);
      
      // 等待後開始下一批
      if (i + CONFIG.parallelCount < targetGroups.length) {
        const wait = 25000 + Math.random() * 15000;
        console.log(`等待 ${(wait / 1000).toFixed(1)} 秒...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    
    console.log('\n========== 全部完成 ==========');
    
  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

main();