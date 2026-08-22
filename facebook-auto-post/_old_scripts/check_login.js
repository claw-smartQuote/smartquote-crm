const { chromium } = require('playwright');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('https://www.facebook.com/login', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: path.join(WORK_DIR, 'fb_login.png') });
  
  // 看看input
  const inputs = await page.$$eval('input', els => els.map(e => ({
    name: e.name, id: e.id, type: e.type, placeholder: e.placeholder
  })));
  console.log('Inputs:', JSON.stringify(inputs, null, 2));
  
  await browser.close();
}

main().catch(e => console.error(e.message));
