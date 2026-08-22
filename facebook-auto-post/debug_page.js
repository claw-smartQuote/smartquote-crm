/**
 * 調試腳本 - 檢查 Facebook 搜索頁面的真實內容
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  
  const page = await context.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  console.log('打開 Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('URL:', page.url());
  
  console.log('\n搜索港車北上群組...');
  await page.goto('https://www.facebook.com/search/groups?q=%E6%B8%AF%E8%BD%A6%E5%8C%97%E4%B8%8A', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // 滾動頁面
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
  }
  
  // 獲取頁面 HTML 長度
  const html = await page.content();
  console.log('HTML 長度:', html.length);
  
  // 檢查各種元素
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body 文字長度:', bodyText.length);
  console.log('Body 文字前 500 字:', bodyText.substring(0, 500));
  
  // 找所有連結
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    return anchors.map(a => ({
      href: a.href,
      text: a.innerText.substring(0, 50),
      classes: a.className
    })).filter(a => a.href.includes('groups') || a.text.includes('加入') || a.text.includes('群組'));
  });
  
  console.log('\n包含 groups 或 加入 的連結:');
  links.slice(0, 20).forEach(l => console.log(' -', l.href, '|', l.text));
  
  // 找帶有 "加入" 的元素
  const joinElements = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    return allElements
      .filter(el => el.innerText && el.innerText.trim() === '加入')
      .map(el => ({
        tag: el.tagName,
        classes: el.className,
        id: el.id,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label')
      }));
  });
  
  console.log('\n包含"加入"的元素:');
  joinElements.slice(0, 10).forEach(e => console.log(' -', JSON.stringify(e)));
  
  // 截圖
  await page.screenshot({ path: 'debug_search.png', fullPage: true });
  console.log('\n截圖已保存');
  
  await browser.close();
}

main().catch(e => {
  console.error('錯誤:', e);
  process.exit(1);
});
