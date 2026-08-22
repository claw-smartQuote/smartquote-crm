const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORK_DIR = '/Users/claw/.openclaw/workspace/facebook-auto-post';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testConnection() {
  console.log('🔌 嘗試連接 Chrome 調試端口...');
  
  // 嘗試連接遠程調試端口
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log('✅ 連接成功！');
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
  console.log('URL:', page.url());
  
  await page.screenshot({ path: path.join(WORK_DIR, 'connected.png') });
  console.log('📸 截圖已保存');
  
  await browser.close();
}

testConnection().catch(e => {
  console.error('連接失敗:', e.message);
  process.exit(1);
});
