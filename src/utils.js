'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ─── Gaussian random ──────────────────────────────────────────────────────────

/**
 * Box-Muller transform — returns a normally distributed random value.
 * @returns {number} value in roughly [-3, 3]
 */
function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Returns a random delay (ms) with a gaussian distribution clamped to [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {Promise<void>}
 */
async function randomDelay(min, max) {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // ~99.7 % of values within [min, max]
  let ms = Math.round(mean + gaussianRandom() * stdDev);
  ms = Math.max(min, Math.min(max, ms));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Viewport / User-Agent ────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

/**
 * Returns a random realistic Chrome user agent string.
 * @returns {string}
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Returns a viewport with slight random variation (±50px) around 1280×800.
 * @returns {{ width: number, height: number }}
 */
function randomViewport() {
  const width = 1280 + Math.floor((Math.random() - 0.5) * 100); // ±50
  const height = 800 + Math.floor((Math.random() - 0.5) * 100);
  return { width, height };
}

// ─── Profile ID ───────────────────────────────────────────────────────────────

/**
 * Generates a deterministic profile ID from platform and avatar name.
 * @param {string} platform  e.g. "twitter" | "facebook"
 * @param {string} avatar    e.g. "aria"
 * @returns {string}
 */
function generateProfileId(platform, avatar) {
  const safePlatform = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeAvatar = avatar.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${safePlatform}-${safeAvatar}`;
}

// ─── Human-like Typing ────────────────────────────────────────────────────────

/**
 * Types text into a page element with human-like delays and occasional pauses.
 * @param {import('playwright').Page} page
 * @param {string} text
 * @param {string|import('playwright').Locator} [selector]  If omitted, types at focused element.
 */
async function humanType(page, text, selector) {
  if (selector) {
    const locator = typeof selector === 'string' ? page.locator(selector) : selector;
    await locator.click();
    await randomDelay(100, 300);
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Occasional mid-word pause (simulate thinking or hesitation ~5 % chance per char)
    if (Math.random() < 0.05) {
      await randomDelay(300, 800);
    }

    await page.keyboard.type(char, { delay: 0 });

    // Per-character delay: 50–200 ms (gaussian)
    await randomDelay(50, 200);

    // After punctuation or space, slightly longer pause
    if ([' ', '.', ',', '!', '?', '\n'].includes(char)) {
      await randomDelay(50, 150);
    }
  }
}

// ─── Image download ───────────────────────────────────────────────────────────

/**
 * Downloads a remote image to a temp file and returns its local path.
 * @param {string} url
 * @returns {Promise<string>} Absolute path to the downloaded file.
 */
async function downloadImage(url) {
  const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z]/g, '');
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
  const tmpPath = path.join('/tmp', `avatar-browser-${uuidv4()}.${safeExt}`);

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024, // 50 MB max
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tmpPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return tmpPath;
}

/**
 * Deletes a temp file, ignoring errors if the file doesn't exist.
 * @param {string} filePath
 */
async function cleanupTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Ignore — file may already be gone
  }
}

/**
 * Removes leftover /tmp/avatar-browser-* files from previous runs.
 * Should be called at startup.
 */
async function cleanupOldTempFiles() {
  try {
    const tmpDir = '/tmp';
    const entries = await fs.promises.readdir(tmpDir);
    const stale = entries.filter((f) => f.startsWith('avatar-browser-'));
    await Promise.all(stale.map((f) => cleanupTempFile(path.join(tmpDir, f))));
    if (stale.length > 0) {
      console.log(`[utils] Cleaned up ${stale.length} stale temp file(s).`);
    }
  } catch (err) {
    console.warn('[utils] Could not clean temp files:', err.message);
  }
}

/**
 * Dismisses cookie consent banners if present.
 * Tries to click the "Refuse" / "Reject" option to avoid accepting tracking.
 * Safe to call even if no banner is present.
 * @param {import('playwright').Page} page
 */
async function dismissCookieBanner(page) {
  const refuseSelectors = [
    // X / Twitter GDPR banner
    'button:has-text("Refuse non-essential cookies")',
    'button:has-text("Reject all")',
    'button:has-text("Reject non-essential")',
    // Generic fallbacks
    'button:has-text("Decline")',
    'button:has-text("Reject")',
  ];

  for (const selector of refuseSelectors) {
    try {
      const btn = page.locator(selector).first();
      const visible = await btn.isVisible({ timeout: 2000 });
      if (visible) {
        await btn.click();
        console.log(`[utils] Cookie banner dismissed via: ${selector}`);
        await randomDelay(500, 1000);
        return;
      }
    } catch {
      // not found, try next selector
    }
  }
}

module.exports = {
  randomDelay,
  gaussianRandom,
  getRandomUserAgent,
  randomViewport,
  generateProfileId,
  humanType,
  downloadImage,
  cleanupTempFile,
  cleanupOldTempFiles,
  dismissCookieBanner,
};
