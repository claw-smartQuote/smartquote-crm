/**
 * Facebook 自動發文 - v12.0
 * 使用 AppleScript 控制真實 Chrome（完全類比真人操作）
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');

const CONFIG = {
  groups: JSON.parse(fs.readFileSync('./target_groups_clean.json', 'utf8')).groups.slice(0, 5),
  imagesDir: '/Users/claw/Desktop/Facebook資料夾/FB_jpeg',
};

function getRandomImage() {
  const images = ['01.jpeg', '02.jpeg', '03.jpeg', '04.jpeg', '05.jpeg'];
  return `${CONFIG.imagesDir}/${images[Math.floor(Math.random() * images.length)]}`;
}

function getAIText() {
  return `📅 2026年4月15日 星期三 長途駕駛請注意防曬和定時休息。祝你旅途平安！`;
}

function getTemplate(aiText) {
  return `【${aiText}】
🚗 節省汽車保險｜ 保險報價｜私家車・電動車・港車北上
🔥 港車北上保險首選！¥1469 起！
永誠保險 — 香港人正規註冊國內保險公司代理人
✅ 交強險 + 商業第三者責任險 + 12次道路救援
WhatsApp 查詢📱 https://api.whatsapp.com/send?phone=85221101144
#港車北上 #汽車保險`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 運行 AppleScript
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文 - v12.0 AppleScript');
  console.log('===========================================\n');

  try {
    // 1. 確保 Chrome 運行
    console.log('[1/6] 確保 Chrome 運行...');
    await runAppleScript(`
      tell application "Google Chrome"
        activate
        if (count of windows) is 0 then
          make new window
        end if
      end tell
    `);
    await delay(2000);

    // 2. 導航到 Facebook
    console.log('[2/6] 導航到 Facebook...');
    await runAppleScript(`
      tell application "Google Chrome"
        tell window 1
          set URL of active tab to "https://www.facebook.com"
        end tell
      end tell
    `);
    await delay(5000);

    // 3. 檢查是否需要登入
    console.log('[3/6] 檢查登入狀態...');
    console.log('請在 Chrome 中確認是否已登入 Facebook');
    console.log('等待 60 秒讓您確認...\n');
    await delay(60000);

    // 4. 測試發文
    console.log('[4/6] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航到群組
        console.log('導航到群組...');
        await runAppleScript(`
          tell application "Google Chrome"
            tell window 1
              set newTab to make new tab with properties {URL:"https://www.facebook.com/groups/${group.id}"}
              set active tab to newTab
            end tell
          end tell
        `);
        await delay(6000);
        console.log('已打開新分頁');

        // 滾動（使用鍵盤滾動）
        console.log('滾動頁面...');
        await runAppleScript(`
          tell application "System Events"
            key code 125 -- down arrow
          end tell
        `);
        await delay(1000);

        // 嘗試點擊發文框（需要知道具體座標）
        // 這裡需要更智能的定位
        
        // 使用 Tab 導航到發文框
        console.log('使用 Tab 導航...');
        for (let t = 0; t < 5; t++) {
          await runAppleScript(`
            tell application "System Events"
              key code 48 -- Tab
            end tell
          `);
          await delay(300);
        }

        // 截圖看看當前狀態
        console.log('截圖...');
        await runAppleScript(`
          do shell script "screencapture -x /tmp/applescript_result_${i}.png"
        `);
        console.log(`截圖: /tmp/applescript_result_${i}.png`);

        // 嘗試輸入
        console.log('輸入內容...');
        const content = getTemplate(getAIText());
        await runAppleScript(`
          tell application "System Events"
            keystroke "${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
          end tell
        `);
        
        await delay(2000);

        // 截圖
        await runAppleScript(`
          do shell script "screencapture -x /tmp/applescript_input_${i}.png"
        `);
        console.log(`截圖: /tmp/applescript_input_${i}.png`);

        if (i < CONFIG.groups.length - 1) {
          const waitTime = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${waitTime/1000} 秒...\n`);
          await delay(waitTime);
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
      }
    }

    console.log('\n========== 測試完成 ==========\n');
    console.log('[5/6] ✅ 完成\n');
    console.log('[6/6] 請查看截圖了解結果\n');

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

main();
