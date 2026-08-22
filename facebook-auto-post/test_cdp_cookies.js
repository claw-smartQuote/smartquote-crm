/**
 * 通過 CDP 從 Chrome 提取 cookies（需要 Chrome 已啟動 remote debugging）
 * 然後用 Stealth 模式的 Playwright 登入
 */
const { chromium } = require('playwright');

async function main() {
  // 方法1: 嘗試連接 CDP 並獲取 cookies
  const cdpUrl = 'http://localhost:9222';
  
  try {
    const versionResp = await fetch(`${cdpUrl}/json/version`);
    const version = await versionResp.json();
    console.log('Chrome調試模式已連接:', version.Browser);
    
    // 列出所有 pages
    const pagesResp = await fetch(`${cdpUrl}/json/list`);
    const pages = await pagesResp.json();
    console.log('可用頁面:', pages.length);
    pages.forEach(p => console.log(' -', p.title?.substring(0, 50), p.url?.substring(0, 50)));
    
  } catch (e) {
    console.log('CDP 連接失敗:', e.message);
  }
  
  // 方法2: 使用 Stealth 模式啟動 Playwright（不觸發自動化檢測）
  console.log('\n使用 Stealth 模式啟動 Chromium...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-destructive-tests',
      '--disable-gpu',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-crashpad',
    ]
  });
  
  // 注入 Stealth 腳本
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  // 移除 webdriver 標記
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    // 移除 automation 標記
    window.navigator.chrome = {
      runtime: {},
      app: {},
    };
    // 模擬 plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { Name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
      ],
    });
    // 模擬 languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
    });
  });
  
  console.log('正在導航到 Facebook 登入頁...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 截圖保存
  await page.screenshot({ path: 'stealth_login.png', fullPage: false });
  console.log('截圖已保存: stealth_login.png');
  
  // 檢查是否需要登入
  const url = page.url();
  console.log('當前 URL:', url);
  
  if (url.includes('login') || url.includes('checkpoint')) {
    console.log('需要登入...');
    
    // 嘗試填入登入資訊
    try {
      await page.fill('input[name="email"]', 'to@smartquote.cn', { timeout: 5000 });
      await page.fill('input[name="pass"]', 'Pin4fb123#', { timeout: 5000 });
      await page.click('button[name="login"]');
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: 'after_login.png', fullPage: false });
      console.log('登入後截圖已保存');
      console.log('登入後 URL:', page.url());
    } catch (e) {
      console.log('填表失敗:', e.message);
    }
  } else {
    console.log('已登入！');
  }
  
  // 搜索港車北上群組
  console.log('\n搜索港車北上群組...');
  await page.goto('https://www.facebook.com/search/groups?q=%E6%B8%AF%E8%BD%A6%E5%8C%97%E4%B8%8A&__a=1', { timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const searchUrl = page.url();
  console.log('搜索 URL:', searchUrl);
  await page.screenshot({ path: 'search_result.png', fullPage: false });
  
  // 嘗試 Graph API（如果已登入）
  try {
    const response = await page.evaluate(async () => {
      const res = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'q=%7B%22groups_for_onboarding_cake%22%3A%7B%22filter%22%3A%22 MEMBERSHIPS%22%7D%7D&__a=1'
      });
      return res.text();
    });
    console.log('Graph API 回應:', response.substring(0, 200));
  } catch (e) {
    console.log('Graph API 失敗:', e.message);
  }
  
  await browser.close();
}

main().catch(console.error);
