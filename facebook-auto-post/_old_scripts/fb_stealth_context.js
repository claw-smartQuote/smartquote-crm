/**
 * Facebook 防機械人 - 高級隱形技術
 * 移除自動化特徵、模擬真實瀏覽器指紋
 */

const { chromium } = require('playwright');

// 高級隱形瀏覽器上下文工廠
async function createStealthBrowser() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-bromium-compositor',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--disable-blink-features=AutomationControlled',
      '--disable-blink-features=AutomationDetector',
      '--disable-speech-input-events',
      '--disable-touch-editing',
      '--disable-touch-viewport',
      '--disable-gpu',
      '--window-size=1920,1080',
    ]
  });

  // 創建隱形上下文
  const context = await browser.newContext({
    viewport: {
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100),
    },
    userAgent: getRandomUserAgent(),
    locale: 'zh-HK',
    timezoneId: 'Asia/Hong_Kong',
    permissions: [],
    ignoreHTTPSErrors: true,
  });

  // 添加隱形腳本到所有頁面
  context.on('page', async (page) => {
    await addStealthScripts(page);
  });

  return { browser, context };
}

// 隨機 User-Agent
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// 添加隱形腳本 - 移除自動化特徵
async function addStealthScripts(page) {
  await page.addInitScript(() => {
    // 移除 WebDriver 特徵
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true
    });

    // 移除 Chrome 全域對象中的自動化相關屬性
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.runtime.connect = window.chrome.runtime.connect || function(){};
    window.chrome.runtime.sendMessage = window.chrome.runtime.sendMessage || function(){};

    // 模擬 plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' }
      ],
      configurable: true
    });

    // 模擬 languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-HK', 'zh-TW', 'zh', 'en-US', 'en'],
      configurable: true
    });

    // 模擬 hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8 + Math.floor(Math.random() * 4),
      configurable: true
    });

    // 模擬 deviceMemory
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true
    });

    // Canvas 指紋隨機化
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      const context = originalGetContext.call(this, type, attributes);
      if (type === '2d') {
        const originalFillText = context.fillText;
        context.fillText = function(...args) {
          // 添加微量隨機偏移模擬真實渲染
          if (Math.random() > 0.95) {
            this.translate(0.1, 0.1);
          }
          return originalFillText.apply(this, args);
        };
      }
      return context;
    };

    // 移除自動化檢測事件監聽器
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'beforeinput' || type === 'webdriverdeselect' || type === 'selenium流入') {
        return;
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    // 模擬 connection
    Object.defineProperty(navigator, 'connection', {
      get: () => ({
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
        saveData: false
      }),
      configurable: true
    });

    // 移除 permission detector 自動化了解
    if (window.permissions) {
      window.permissions.query = window.permissions.query || function(options) {
        return Promise.resolve({ state: 'prompt' });
      };
    }

    // 自動化標記清除
    Object.defineProperty(document, 'hidden', { get: () => false });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });

    console.log('[Stealth] 隱形腳本已載入');
  });
}

module.exports = {
  createStealthBrowser,
  getRandomUserAgent
};
