/**
 * Facebook 自動發文 v5.2 - 修復版
 * 修復：用鍵盤輸入代替剪貼簿貼上
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

const startIndex = parseInt(process.argv[2]) || 0;
const postCount = parseInt(process.argv[3]) || 5;

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
  const recentPosts = log.posts.filter(p => {
    const postTime = new Date(p.timestamp).getTime();
    const now = Date.now();
    return p.group_id === groupId && p.status === 'success' && (now - postTime) < 24 * 60 * 60 * 1000;
  });
  return recentPosts.length > 0;
}

function getRandomTemplate() {
  const templates = [
    `🚗 港車北上保險 | 永誠財產保險
📢 專業港車北上汽車保險服務
✅ 合法合規 ✅ 快速理賠 ✅ 價格優惠

📱 WhatsApp: +852 9492 4444
🌐 www.alltrust.com.cn

#港車北上 #汽車保險 #永誠保險`,

    `🚙 港車北上必備保險 | 永誠財產保險
📢 為您的愛車提供全方位保障
✅ 第三者責任險 ✅ 車損險 ✅ 盜搶險

📱 立即查詢: +852 9492 4444
🌐 www.alltrust.com.cn

#港車北上保險 #汽車保險 #香港保險`,

    `🛡️ 港車北上保險專家 | 永誠財產保險
📢 十年專業經驗，值得信賴
✅ 一站式服務 ✅ 理賠快捷 ✅ 保障全面

📱 WhatsApp: +852 9492 4444
🌐 www.alltrust.com.cn

#港車北上 #保險 #永誠保險`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function getRandomImage() {
  const images = fs.readdirSync(CONFIG.imagesDir).filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png'));
  if (images.length === 0) return null;
  return CONFIG.imagesDir + '/' + images[Math.floor(Math.random() * images.length)];
}

async function postToGroup(page, group) {
  const groupId = group.id;
  const groupName = group.name;
  const groupUrl = `https://www.facebook.com/groups/${groupId}/`;
  
  console.log(`\n[${groupName}] 開始發文...`);
  
  try {
    // 導航到群組
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // 點擊「建立帖子」或「寫點內容」
    const createPostSelectors = [
      'span:has-text("建立帖子")',
      'span:has-text("寫點內容")',
      'span:has-text("Create a public post")',
      'span:has-text("Write something...")',
      '[aria-label="建立帖子"]',
      '[aria-label="Create a post"]',
      '[aria-label="Write something..."]',
    ];
    
    let createPostBtn = null;
    for (const selector of createPostSelectors) {
      createPostBtn = await page.$(selector);
      if (createPostBtn) break;
    }
    
    if (!createPostBtn) {
      throw new Error('找不到建立帖子按鈕');
    }
    
    await createPostBtn.click();
    await page.waitForTimeout(3000);
    
    // 等待模態框出現
    // 等待帖子模態框出現 (排除 Messenger)
    await page.waitForFunction(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        if (dialog.textContent.includes('建立帖子') || dialog.textContent.includes('Create a post')) {
          return true;
        }
      }
      return false;
    }, { timeout: 10000 });
    
    // 上傳圖片
    const image = getRandomImage();
    if (image) {
      console.log(`  上傳圖片: ${image}`);
      
      // 點擊「相片／影片」按鈕
      const photoBtn = await page.$('span:has-text("相片／影片")') || 
                       await page.$('span:has-text("Photo/Video")') ||
                       await page.$('[aria-label="相片／影片"]') ||
                       await page.$('[aria-label="Photo/Video"]');
      
      if (photoBtn) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          photoBtn.click()
        ]);
        await fileChooser.setFiles(image);
        await page.waitForTimeout(3000);
        
        // 按 Escape 關閉檔案選擇框
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    }
    
    // 貼文字 - 使用鍵盤輸入
    const template = getRandomTemplate();
    console.log(`  輸入文字...`);
    
    // 找到輸入框
    // 找到帖子模態框中的輸入框
    const postDialog = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        if (dialog.textContent.includes('建立帖子') || dialog.textContent.includes('Create a post')) {
          return dialog;
        }
      }
      return null;
    });
    
    const inputSelectors = [
      '[contenteditable="true"][data-lexical-editor="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
    ];
    
    let input = null;
    for (const selector of inputSelectors) {
      // 在帖子模態框內查找
      const inputs = await page.$$(selector);
      for (const inp of inputs) {
        const isInDialog = await inp.evaluate(el => {
          const dialog = el.closest('[role="dialog"]');
          return dialog && (dialog.textContent.includes('建立帖子') || dialog.textContent.includes('Create a post'));
        });
        if (isInDialog) {
          input = inp;
          break;
        }
      }
      if (input) break;
    }
    
    if (!input) {
      throw new Error('找不到輸入框');
    }
    
    // 點擊輸入框
    await input.click();
    await page.waitForTimeout(500);
    
    // 用鍵盤輸入文字
    await page.keyboard.type(template, { delay: 10 });
    await page.waitForTimeout(2000);
    
    // 點擊發佈按鈕
    console.log(`  點擊發佈...`);
    const postBtnSelectors = [
      'span:has-text("發佈")',
      'span:has-text("Post")',
      '[aria-label="發佈"]',
      '[aria-label="Post"]',
    ];
    
    let postBtn = null;
    for (const selector of postBtnSelectors) {
      postBtn = await page.$(selector);
      if (postBtn) break;
    }
    
    if (!postBtn) {
      throw new Error('找不到發佈按鈕');
    }
    
    // 確保按鈕可用
    await page.waitForTimeout(1000);
    await postBtn.click();
    console.log(`  ✅ 已點擊發佈`);
    
    // 等待發佈完成
    await page.waitForTimeout(5000);
    
    // 記錄成功
    addPostRecord({
      group_id: groupId,
      group_name: groupName,
      status: 'success',
      timestamp: new Date().toISOString(),
      template: template.substring(0, 50) + '...'
    });
    
    console.log(`  ✅ 發文成功`);
    return true;
    
  } catch (error) {
    console.log(`  ❌ 發文失敗: ${error.message}`);
    
    // 記錄失敗
    addPostRecord({
      group_id: groupId,
      group_name: groupName,
      status: 'failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    return false;
  }
}

async function main() {
  console.log(`========== Facebook 自動發文 v5.2 ==========`);
  console.log(`起始: ${startIndex}, 數量: ${postCount}`);
  
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  
  console.log(`✅ 已連接 Chrome`);
  console.log(`✅ 使用已登入頁面: ${page.url()}`);
  
  const groupsToProcess = CONFIG.groups.slice(startIndex, startIndex + postCount);
  console.log(`\n========== 開始發文 (${groupsToProcess.length} 個群組) ==========`);
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  
  for (let i = 0; i < groupsToProcess.length; i++) {
    const group = groupsToProcess[i];
    console.log(`\n[${i + 1}/${groupsToProcess.length}] ${group.name} (${group.id})`);
    
    // 檢查是否已發文
    if (hasAlreadyPosted(group.id)) {
      console.log(`⏭ 跳過 - 24小時內已發文`);
      skipCount++;
      continue;
    }
    
    const success = await postToGroup(page, group);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // 隨機等待 5-10 秒
    const waitTime = 5000 + Math.random() * 5000;
    console.log(`等待 ${(waitTime / 1000).toFixed(1)} 秒...`);
    await page.waitForTimeout(waitTime);
  }
  
  console.log(`\n========== 完成 ==========`);
  console.log(`✅ 成功: ${successCount}, ❌ 失敗: ${failCount}, ⏭ 跳過: ${skipCount}`);
  
  await browser.close();
}

main().catch(console.error);
