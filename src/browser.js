'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-extra');
const { chromium: baseChromium } = require('playwright');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Mutex } = require('async-mutex');
const { getRandomUserAgent, randomViewport } = require('./utils');
const { profileDir, getProfile } = require('./profiles');
const { startDolphinProfile, stopDolphinProfile } = require('./dolphin');

// Apply stealth plugin to playwright-extra
chromium.use(StealthPlugin());

const MAX_BROWSER_TIMEOUT = parseInt(process.env.MAX_BROWSER_TIMEOUT || '600', 10) * 1000; // ms

// ─── Per-profile mutex registry ───────────────────────────────────────────────
// Prevents two concurrent tasks from accessing the same browser profile.
const profileMutexes = new Map();

function getMutexForProfile(profileId) {
  if (!profileMutexes.has(profileId)) {
    profileMutexes.set(profileId, new Mutex());
  }
  return profileMutexes.get(profileId);
}

// ─── Browser factory ──────────────────────────────────────────────────────────

/**
 * Launches a Playwright Chromium browser with stealth and persistent context.
 *
 * @param {string} profileId  - Avatar profile ID (determines the profile directory).
 * @param {object} [options]
 * @param {boolean} [options.headless=true]  - false for manual login sessions.
 * @param {string}  [options.platform]       - Platform hint (unused for now).
 * @returns {Promise<{ browser: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
async function launchBrowser(profileId, options = {}) {
  const headless = options.headless !== false;
  const userDataDir = profileDir(profileId);

  // Ensure profile directory exists
  fs.mkdirSync(userDataDir, { recursive: true });

  const viewport = randomViewport();
  const userAgent = getRandomUserAgent();

  // For headed (login) sessions prefer real Chrome — it has a genuine fingerprint
  // that social media login flows trust. Fall back to Playwright's Chromium if not found.
  const CHROME_PATHS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    '/usr/bin/google-chrome',                                        // Linux
    '/usr/bin/google-chrome-stable',                                 // Linux alt
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',   // Windows
  ];
  let executablePath;
  if (!headless) {
    executablePath = CHROME_PATHS.find(p => {
      try { fs.accessSync(p); return true; } catch { return false; }
    });
    if (executablePath) {
      console.log(`[browser] Using real Chrome for login session: ${executablePath}`);
    } else {
      console.warn('[browser] Real Chrome not found — falling back to Playwright Chromium. Login may be blocked by bot detection.');
    }
  }

  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=' + viewport.width + ',' + viewport.height,
  ];

  // --disable-gpu and --disable-dev-shm-usage are only needed in headless/Docker environments.
  // In headed mode they look suspicious to bot detectors.
  if (headless) {
    baseArgs.push('--disable-gpu', '--disable-dev-shm-usage');
  }

  const profile = getProfile(profileId);

  // ─── Dolphin Anty path ────────────────────────────────────────────────────
  if (profile?.dolphinProfileId) {
    const { wsEndpoint } = await startDolphinProfile(profile.dolphinProfileId);
    console.log(`[browser] Connecting via Dolphin CDP for ${profileId}: ${wsEndpoint}`);

    const cdpBrowser = await baseChromium.connectOverCDP(wsEndpoint);
    const contexts = cdpBrowser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await cdpBrowser.newContext();

    const cookiesFile = path.join(userDataDir, 'cookies.json');
    if (fs.existsSync(cookiesFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
        if (Array.isArray(saved) && saved.length > 0) {
          await context.addCookies(saved);
          console.log(`[browser] Injected ${saved.length} saved cookies for ${profileId} (Dolphin)`);
        }
      } catch (err) {
        console.warn(`[browser] Failed to inject cookies for ${profileId}:`, err.message);
      }
    }

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    return { browser: context, page, _cdpBrowser: cdpBrowser, _dolphinProfileId: profile.dolphinProfileId };
  }

  // ─── Standard Playwright path ─────────────────────────────────────────────
  let proxy;
  if (profile?.proxy) {
    try {
      const url = new URL(profile.proxy);
      proxy = { server: `${url.protocol}//${url.hostname}:${url.port}` };
      if (url.username) proxy.username = decodeURIComponent(url.username);
      if (url.password) proxy.password = decodeURIComponent(url.password);
    } catch {
      proxy = { server: profile.proxy };
    }
    console.log(`[browser] Using proxy for ${profileId}: ${proxy.server}`);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    executablePath,   // undefined = use Playwright's Chromium (headless mode)
    args: baseArgs,
    viewport,
    userAgent,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['notifications'],
    ignoreHTTPSErrors: false,
    proxy,
  });

  // Mask automation signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    // Provide a realistic-looking (but empty) PluginArray rather than a plain array
    Object.defineProperty(navigator, 'plugins', {
      get: () => Object.create(PluginArray.prototype),
    });
  });

  // Inject saved cookies if a cookies.json exists in the profile directory.
  // This is how imported auth cookies (auth_token, ct0, etc.) survive across sessions.
  const cookiesFile = path.join(userDataDir, 'cookies.json');
  if (fs.existsSync(cookiesFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
      if (Array.isArray(saved) && saved.length > 0) {
        await context.addCookies(saved);
        console.log(`[browser] Injected ${saved.length} saved cookies for ${profileId}`);
      }
    } catch (err) {
      console.warn(`[browser] Failed to inject cookies for ${profileId}:`, err.message);
    }
  }

  // Open initial page
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { browser: context, page };
}

/**
 * Gracefully closes a browser context, force-killing if it hangs.
 * @param {import('playwright').BrowserContext} browser
 */
async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Browser close timeout')), 10000)
      ),
    ]);
  } catch (err) {
    console.warn('[browser] Force-closing browser after timeout:', err.message);
    try { await browser.close(); } catch { /* ignored */ }
  }
}

/**
 * Higher-order function: acquires the per-profile mutex, launches a browser,
 * runs the provided callback, then always closes the browser and releases the lock.
 *
 * Rejects with a 429-style error if the mutex cannot be acquired within the timeout.
 *
 * @param {string} profileId
 * @param {object} [options]              - Passed to launchBrowser.
 * @param {number} [options.lockTimeout]  - ms to wait for lock (default: MAX_BROWSER_TIMEOUT).
 * @param {Function} callback             - async (browser, page) => result
 * @returns {Promise<any>}
 */
async function getBrowserForProfile(profileId, options, callback) {
  // Support (profileId, callback) shorthand
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const mutex = getMutexForProfile(profileId);
  const lockTimeout = options.lockTimeout || MAX_BROWSER_TIMEOUT;

  // Try to acquire lock within the timeout
  let release;
  try {
    const lockPromise = mutex.acquire();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Profile busy: another task is already running for this profile.'), { code: 'PROFILE_BUSY' })), lockTimeout)
    );
    release = await Promise.race([lockPromise, timeoutPromise]);
  } catch (err) {
    throw err; // PROFILE_BUSY error
  }

  let launched = null;
  try {
    launched = await launchBrowser(profileId, options);
    const { browser, page } = launched;

    // Enforce overall browser timeout
    const result = await Promise.race([
      callback(browser, page),
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Browser task exceeded MAX_BROWSER_TIMEOUT.'), { code: 'BROWSER_TIMEOUT' })), MAX_BROWSER_TIMEOUT)
      ),
    ]);

    return result;
  } finally {
    if (launched?._cdpBrowser) {
      // Dolphin path: let Dolphin own the browser process, just stop via API
      stopDolphinProfile(launched._dolphinProfileId).catch(() => {});
    } else if (launched?.browser) {
      await closeBrowser(launched.browser);
    }
    release();
  }
}

module.exports = {
  launchBrowser,
  closeBrowser,
  getBrowserForProfile,
  getMutexForProfile,
};
