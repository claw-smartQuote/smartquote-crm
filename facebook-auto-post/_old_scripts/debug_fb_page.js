/**
 * Facebook 自動發文 - 調試頁面結構
 */

const CDP = require('chrome-remote-interface');

async function main() {
  console.log('===========================================');
  console.log(' Facebook - 調試頁面結構');
  console.log('===========================================\n');

  try {
    // 連接到 Chrome
    console.log('連接到 Chrome...');
    const client = await CDP({
      host: '127.0.0.1',
      port: 9222
    });

    const { Page, Runtime } = client;
    await Page.enable();
    await Runtime.enable();

    // 導航到群組
    const groupId = '2580188118918671';
    console.log(`導航到群組: ${groupId}`);
    await Page.navigate({ url: `https://www.facebook.com/groups/${groupId}` });
    await Page.loadEventFired();
    await new Promise(r => setTimeout(r, 8000)); // 等待更長時間

    // 獲取頁面標題和 URL
    const title = await Runtime.evaluate({ expression: 'document.title' });
    console.log(`標題: ${title.result.value}`);

    // 獲取 URL
    const url = await Runtime.evaluate({ expression: 'window.location.href' });
    console.log(`URL: ${url.result.value}`);

    // 檢查是否有發文框
    const postBoxInfo = await Runtime.evaluate({ expression: `
      (function() {
        // 嘗試多種選擇器
        const selectors = [
          'button:has-text("寫點內容")',
          'button:has-text("建立帖子")',
          'div[role="button"]',
          'div[aria-label*="建立"]',
          'div[aria-label*="寫"]',
          'span:has-text("建立帖子")',
          'form[role="presentation"]'
        ];
        
        const results = [];
        for (const sel of selectors) {
          try {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
              results.push({
                selector: sel,
                count: els.length,
                visible: els[0].offsetParent !== null,
                text: els[0].textContent.substring(0, 50)
              });
            }
          } catch (e) {}
        }
        
        // 嘗試找 contentEditable
        const editables = document.querySelectorAll('div[contenteditable="true"]');
        results.push({
          type: 'contentEditable',
          count: editables.length
        });
        
        return results;
      })()
    ` });

    console.log('\n找到的元素:');
    console.log(JSON.stringify(postBoxInfo.result.value, null, 2));

    // 截圖
    const { data } = await Page.captureScreenshot({ format: 'png', quality: 80 });
    require('fs').writeFileSync('/tmp/fb_debug.png', Buffer.from(data, 'base64'));
    console.log('\n截圖已保存: /tmp/fb_debug.png');

    await client.close();
    
  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

main();
