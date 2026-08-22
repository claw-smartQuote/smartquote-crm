/**
 * Simple screenshot test
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
  console.log('1. Getting Chrome WS URL...');
  const json = await fetchJson('http://127.0.0.1:9222/json/version');
  console.log('WS:', json.webSocketDebuggerUrl.substring(0, 50));

  console.log('2. Connecting...');
  const browser = await puppeteer.connect({
    browserWSEndpoint: json.webSocketDebuggerUrl,
    ignoreHTTPSErrors: true
  });
  console.log('Connected');

  console.log('3. Finding page...');
  const pages = await browser.pages();
  console.log('Total pages:', pages.length);

  for (let i = 0; i < pages.length; i++) {
    console.log(`  Page ${i}: ${pages[i].url().substring(0, 60)}`);
  }

  const page = pages.find(p => p.url().includes('2580188118918671'));
  if (!page) {
    console.log('Target page not found');
    await browser.disconnect();
    return;
  }

  console.log('4. Taking screenshot...');
  await page.screenshot({ path: '/tmp/fb_check.png' });
  console.log('Screenshot saved');

  console.log('5. Getting page text...');
  const text = await page.evaluate(() => document.body?.innerText?.substring(0, 200) || 'N/A');
  console.log('Body text:', text.replace(/\n/g, ' ').substring(0, 100));

  await browser.disconnect();
  console.log('Done');
}

main().catch(e => console.error('Error:', e.message));