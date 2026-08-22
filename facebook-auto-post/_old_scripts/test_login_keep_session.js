/**
 * Facebook 自動發文 - 測試腳本 v3.2 
 * 測試：登入 → 保持Session → 新分頁發文
 * 
 * 改進：確保Cookie在所有分頁中共享
 */

const { chromium } = require('playwright');
const AntiBot = require('./fb_anti_bot.js');
const fs = require('fs');

const CONFIG = {
  fbEmail: '萊to@smartquote.cn',
  fbPassword: 'Pin4fb123',
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups.slice(0, 5), // 5個測試群組
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
};

async function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

async function getAIText() {
  return `📅 2026年4月15日 星期三 氣溫上升，長途駕駛請注意防曬和定時休息。祝你旅途平安！`;
}

async function getTemplate(aiText) {
  return `【${aiText}】
🚗 節省汽車保費｜ 保險報價｜私家車・電動車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 12次道路救援
WhatsApp 查詢📱 https://api.whatsapp.com/send?phone=85221101144
#港車北上 #汽車保險`;
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文測試 - v3.2 Session共享');
  console.log('===========================================\n');

  let browser = null;

  try {
    // 1. 啟動瀏覽器（無頭模式false，這樣可以看到）
    console.log('[1/5] 啟動瀏覽器...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-bromium-compositor',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    });

    // 創建上下文（所有分頁共享）
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'zh-HK',
    });

    // 2. 登入
    console.log('[2/5] 開啟 Facebook...');
    const loginPage = await context.newPage();
    await loginPage.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`URL: ${loginPage.url()}`);

    // 如果需要登入
    const emailInput = await loginPage.$('input#email');
    if (emailInput) {
      console.log('\n需要登入！請在瀏覽器中手動登入...');
      console.log('電郵: 萊to@smartquote.cn');
      console.log('密碼: Pin4fb123\n');
      
      // 等待用戶在瀏覽器中完成登入
      await loginPage.waitForFunction(() => {
        return !window.location.href.includes('login') && 
               document.body.textContent.length > 1000;
      }, { timeout: 0 }); // 不超時，等待用戶
      
      console.log('✅ 登入成功！\n');
    } else {
      console.log('已登入\n');
    }

    // 3. 保存Cookie（登入後）
    console.log('[3/5] 保存Session...');
    const cookies = await context.cookies();
    console.log(`已保存 ${cookies.length} 個Cookies`);

    // 4. 在新分頁發文測試
    console.log('[4/5] 開啟新分頁測試...\n');
    console.log('========== 開始發文測試 ==========\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      // 每個帖子開新分頁
      const page = await context.newPage();
      
      try {
        // 導航（帶長timeout）
        console.log('導航到群組...');
        await page.goto(`https://www.facebook.com/groups/${group.id}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        console.log(`URL: ${page.url().substring(0, 60)}...`);

        // 等待頁面穩定
        await page.waitForTimeout(2000);

        // 檢查是否跳轉到登入頁
        if (page.url().includes('login')) {
          console.log('⚠️ Session失效，需要重新登入');
          await page.close();
          break;
        }

        // 滾動模擬
        console.log('模擬瀏覽...');
        await AntiBot.randomScrolling(page);

        // 打開發文框 - 多種策略
        console.log('打開發文框...');
        let postBoxClicked = false;

        // 策略1: 找"寫點內容"按鈕
        const postBtn = await page.$('button:has-text("寫點內容")');
        if (postBtn && await postBtn.isVisible()) {
          await AntiBot.humanClick(page, 'button:has-text("寫點內容")');
          postBoxClicked = true;
          console.log('[策略1] 成功');
        }

        // 策略2: 找composer
        if (!postBoxClicked) {
          const composer = await page.$('div[role="composer"]');
          if (composer && await composer.isVisible()) {
            await composer.click();
            postBoxClicked = true;
            console.log('[策略2] 成功');
          }
        }

        // 策略3: 點擊頁面中央
        if (!postBoxClicked) {
          await page.mouse.click(700, 400);
          await page.waitForTimeout(1500);
          console.log('[策略3] 座標點擊');
        }

        await page.waitForTimeout(2000);

        // 找可編輯區域
        let editableDiv = await page.$('div[contenteditable="true"]');
        
        // 如果找不到，嘗試更多選擇器
        if (!editableDiv) {
          const altEditables = await page.$$('div[contenteditable="true"][role="presentation"]');
          if (altEditables.length > 0) {
            editableDiv = altEditables[0];
            console.log('使用替代可編輯div');
          }
        }

        if (!editableDiv) {
          console.log('❌ 找不到可編輯區域');
          await page.screenshot({ path: `/tmp/test_no_editor_${i}.png` });
          console.log(`截圖: /tmp/test_no_editor_${i}.png`);
          await page.close();
          continue;
        }

        console.log('✅ 找到可編輯區域');

        // 輸入內容
        console.log('輸入內容...');
        const aiText = await getAIText();
        const content = await getTemplate(aiText);
        await editableDiv.click();
        await page.waitForTimeout(300);
        await page.keyboard.type(content, { delay: 30 });
        console.log(`已輸入 ${content.length} 字`);

        await page.waitForTimeout(1000);

        // 上傳圖片
        console.log('上傳圖片...');
        const imagePath = await getRandomImage();
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(imagePath);
          console.log('圖片已設定');
          await page.waitForTimeout(4000); // 等待上傳
        } else {
          console.log('無圖片上傳框');
        }

        // 找發佈按鈕
        console.log('點擊發佈...');
        let published = false;

        // 策略1: "發佈"按鈕
        const publishBtn = await page.$('button:has-text("發佈")');
        if (publishBtn && await publishBtn.isVisible()) {
          await publishBtn.click();
          published = true;
          console.log('[發佈策略1] 成功');
        }

        // 策略2: "分享"按鈕
        if (!published) {
          const shareBtn = await page.$('button:has-text("分享")');
          if (shareBtn && await shareBtn.isVisible()) {
            await shareBtn.click();
            published = true;
            console.log('[發佈策略2] 成功');
          }
        }

        // 策略3: Enter鍵提交
        if (!published) {
          await page.keyboard.press('Enter');
          console.log('[發佈策略3] Enter鍵');
        }

        await page.waitForTimeout(3000);

        // 檢查結果
        const finalUrl = page.url();
        console.log(`發佈後URL: ${finalUrl.substring(0, 60)}...`);

        if (finalUrl.includes('/groups/') && !finalUrl.includes('login')) {
          console.log('✅ 發文可能成功！');
        } else {
          console.log('⚠️ 可能失敗');
        }

        // 截圖
        await page.screenshot({ 
          path: `/tmp/test_result_${i}_${group.id.substring(0, 8)}.png` 
        });
        console.log(`截圖: /tmp/test_result_${i}_${group.id.substring(0, 8)}.png`);

        // 關閉分頁
        await page.close();

        // 間隔
        if (i < CONFIG.groups.length - 1) {
          const delay = Math.floor(Math.random() * 20000) + 15000;
          console.log(`\n等待 ${(delay/1000).toFixed(1)} 秒...\n`);
          await new Promise(r => setTimeout(r, delay));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
        await page.screenshot({ path: `/tmp/test_error_${i}.png` }).catch(() => {});
        await page.close().catch(() => {});
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[5/5] 瀏覽器保持開啟中...\n');
    console.log('按 Ctrl+C 結束\n');

    // 保持進程
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
