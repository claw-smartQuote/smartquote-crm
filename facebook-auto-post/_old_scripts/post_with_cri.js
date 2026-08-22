/**
 * Facebook 自動發文 - chrome-remote-interface 版本
 */

const CDP = require('chrome-remote-interface');
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
  const today = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `📅 ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;
  const dates = [dateStr];
  const weather = ['路面濕滑，請注意車距，減速慢行。', '氣溫上升，長途駕駛請注意防曬和定時休息。', '晚間駕駛請開啟車燈，確保安全。'];
  const greeting = ['祝你旅途平安！', '願您一路順風！', '出行順利！'];
  return `${dates[Math.floor(Math.random() * dates.length)]} ${weather[Math.floor(Math.random() * weather.length)]} ${greeting[Math.floor(Math.random() * greeting.length)]}`;
}

function getTemplate(aiText) {
  return `【${aiText}】
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
#港車北上 #汽車保險 #保費 #續保 #modelS #Tesla #modelY #BYD`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('===========================================');
  console.log(' Facebook 自動發文 - CRI 版本');
  console.log('===========================================\n');

  let client;

  try {
    // 連接到 Chrome
    console.log('[1/5] 連接到 Chrome...');
    client = await CDP({
      host: '127.0.0.1',
      port: 9222
    });

    const { Page, Runtime, DOM, Input } = client;
    await Page.enable();
    await Runtime.enable();

    console.log('✅ 已連接\n');

    // 2. 導航到第一個群組
    console.log('[2/5] 開始發文測試...\n');

    for (let i = 0; i < CONFIG.groups.length; i++) {
      const group = CONFIG.groups[i];
      console.log(`\n--- 測試 ${i + 1}/${CONFIG.groups.length} ---`);
      console.log(`群組: ${group.name}`);

      try {
        // 導航到群組
        console.log('導航到群組...');
        await Page.navigate({ url: `https://www.facebook.com/groups/${group.id}` });
        await Page.loadEventFired();
        await delay(4000);

        // 滾動頁面
        console.log('滾動...');
        await Runtime.evaluate({ expression: 'window.scrollBy(0, 300)' });
        await delay(1500);

        // 點擊發文框（使用 JavaScript）
        console.log('找發文框...');
        
        const clickResult = await Runtime.evaluate({ expression: `
          (function() {
            // 方法1: 找 span 內容匹配
            const spans = document.querySelectorAll('span');
            for (const s of spans) {
              const text = s.textContent.trim();
              if ((text.includes('寫點內容') || text.includes('建立帖子') || text.includes('写点什么')) && s.offsetParent !== null) {
                s.click();
                return { success: true, selector: 'span: ' + text };
              }
            }
            // 方法2: 找 aria-label 匹配的按鈕
            const btns = document.querySelectorAll('div[role="button"], button');
            for (const b of btns) {
              const label = b.getAttribute('aria-label') || '';
              if ((label.includes('寫') || label.includes('建立') || label.includes('Create') || label.includes('Write')) && b.offsetParent !== null) {
                b.click();
                return { success: true, selector: 'aria-label: ' + label };
              }
            }
            return { success: false };
          })()
        ` });
        
        if (clickResult.result.success) {
          console.log(`✅ 點擊成功: ${clickResult.result.value.selector}`);
        } else {
          console.log('⚠️ 未找到發文框，嘗試座標點擊');
          await Input.dispatchMouseEvent({ x: 650, y: 280, type: 'mousePressed' });
          await Input.dispatchMouseEvent({ x: 650, y: 280, type: 'mouseReleased' });
        }
        
        await delay(2500);

        // 找輸入框並輸入
        console.log('輸入內容...');
        const content = getTemplate(getAIText());
        
        const inputResult = await Runtime.evaluate({ expression: `
          (function() {
            // 嘗試多種輸入框選擇器
            const selectors = [
              'div[contenteditable="true"][data-lexical-editor="true"]',
              'div[contenteditable="true"][role="textbox"]',
              'div[contenteditable="true"]',
            ];
            for (const sel of selectors) {
              const els = document.querySelectorAll(sel);
              for (const el of els) {
                if (el.offsetParent !== null) {
                  el.focus();
                  el.textContent = ${JSON.stringify(content)};
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  return { success: true, length: ${content.length}, selector: sel };
                }
              }
            }
            return { success: false };
          })()
        ` });

        if (inputResult.result.success) {
          console.log(`✅ 輸入成功: ${inputResult.result.value.length} 字`);
        } else {
          console.log('❌ 找不到輸入框');
          await delay(2000);
          continue;
        }

        await delay(1500);

        // 上傳圖片（通過文件選擇對話框）
        console.log('上傳圖片...');
        // 截圖
        console.log('截圖...');
        const { data } = await Page.captureScreenshot({ format: 'png' });
        fs.writeFileSync(`/tmp/fb_result_${i}.png`, Buffer.from(data, 'base64'));
        console.log(`截圖: /tmp/fb_result_${i}.png`);

        // 點擊發佈（優先「發佈」，備用「分享」）
        console.log('點擊發佈...');
        await Runtime.evaluate({ expression: `
          (function() {
            const allBtns = document.querySelectorAll('div[role="button"], button');
            // 先找「發佈」
            for (const b of allBtns) {
              const text = b.textContent.trim();
              if ((text === '發佈' || text === '发布' || text === 'Post') && b.offsetParent !== null) {
                b.click();
                return 'clicked: ' + text;
              }
            }
            // 備用「分享」
            for (const b of allBtns) {
              const text = b.textContent.trim();
              if ((text === '分享' || text === 'Share') && b.offsetParent !== null) {
                b.click();
                return 'clicked: ' + text;
              }
            }
            return 'no button found';
          })()
        ` });
        
        await delay(4000);

        // 截圖結果
        const { data: resultData } = await Page.captureScreenshot({ format: 'png' });
        fs.writeFileSync(`/tmp/fb_result_${i}_final.png`, Buffer.from(resultData, 'base64'));
        console.log(`結果截圖: /tmp/fb_result_${i}_final.png`);

        // 返回主頁
        console.log('返回主頁...');
        await Page.navigate({ url: 'https://www.facebook.com' });
        await Page.loadEventFired();
        await delay(3000);

        if (i < CONFIG.groups.length - 1) {
          const wait = Math.floor(Math.random() * 20000) + 15000;
          console.log(`等待 ${wait/1000} 秒...\n`);
          await new Promise(r => setTimeout(r, wait));
        }

      } catch (error) {
        console.error(`❌ 錯誤: ${error.message}`);
      }
    }

    console.log('\n========== 完成 ==========\n');
    console.log('[3/5] ✅ 發文完成\n');
    console.log('[4/5] 請查看截圖了解結果\n');
    console.log('[5/5] Chrome 保持開啟\n');

    await client.close();

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (client) await client.close();
  }
}

main();
