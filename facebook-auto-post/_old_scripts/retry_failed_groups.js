/**
 * 重跑失敗群組 - 使用 V5 最終版流程
 * 不檢查 hasAlreadyPosted，直接發文
 */

const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./groups_to_retry.json', 'utf8')).groups,
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
  postLogFile: './fb_post_log.json',
};

const startIndex = parseInt(process.argv[2]) || 0;
const postCount = parseInt(process.argv[3]) || CONFIG.groups.length;

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
    await page.waitForTimeout(2000);
    
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
    await page.waitForTimeout(2000);
    
    // 等待模態框出現
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    
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
    
    // 貼文字
    const template = getRandomTemplate();
    console.log(`  貼文字...`);
    
    // 找到輸入框
    const inputSelectors = [
      '[role="dialog"] [contenteditable="true"]',
      '[role="dialog"] [data-lexical-editor="true"]',
      '[role="dialog"] [role="textbox"]',
    ];
    
    let input = null;
    for (const selector of inputSelectors) {
      input = await page.$(selector);
      if (input) break;
    }
    
    if (!input) {
      throw new Error('找不到輸入框');
    }
    
    // 用剪貼簿貼上文字
    await page.evaluate(async (text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboardData
      });
      document.querySelector('[role="dialog"] [contenteditable="true"]').dispatchEvent(pasteEvent);
    }, template);
    
    await page.waitForTimeout(2000);
    
    // 點擊發佈按鈕
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
  console.log(`=== 開始重跑失敗群組 ===`);
  console.log(`群組數: ${CONFIG.groups.length}`);
  console.log(`startIndex: ${startIndex}, postCount: ${postCount}`);
  
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  
  let successCount = 0;
  let failCount = 0;
  
  const groupsToProcess = CONFIG.groups.slice(startIndex, startIndex + postCount);
  
  for (let i = 0; i < groupsToProcess.length; i++) {
    const group = groupsToProcess[i];
    console.log(`\n[${i + 1}/${groupsToProcess.length}] 處理群組: ${group.name}`);
    
    const success = await postToGroup(page, group);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // 隨機等待 5-10 秒
    const waitTime = 5000 + Math.random() * 5000;
    console.log(`  等待 ${Math.round(waitTime / 1000)} 秒...`);
    await page.waitForTimeout(waitTime);
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失敗: ${failCount}`);
  
  await browser.close();
}

main().catch(console.error);
