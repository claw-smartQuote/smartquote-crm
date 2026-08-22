/**
 * FB 快速發文測試
 */

const puppeteer = require('puppeteer-extra');
const http = require('http');

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
  const json = await fetchJson('http://127.0.0.1:9222/json/version');
  const browser = await puppeteer.connect({
    browserWSEndpoint: json.webSocketDebuggerUrl,
    ignoreHTTPSErrors: true
  });

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('2580188118918671'));

  if (!page) {
    console.log('Page not found');
    await browser.disconnect();
    return;
  }

  console.log('Page found, clicking...');
  await page.mouse.click(700, 400);
  await new Promise(r => setTimeout(r, 2000));

  const editable = await page.$('div[contenteditable="true"]');
  if (!editable) {
    console.log('No editor');
    await browser.disconnect();
    return;
  }

  console.log('Editor found, typing short test...');
  await editable.click();
  await page.keyboard.type('Test post from AI小龍蝦', { delay: 50 });
  console.log('Typed!');
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: '/tmp/fb_test1.png' });
  console.log('Screenshot saved');

  await browser.disconnect();
  console.log('Done');
}

main().catch(e => console.error('Error:', e.message));