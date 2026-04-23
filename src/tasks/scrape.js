'use strict';

const fs = require('fs');
const path = require('path');
const { getPrimaryProvider } = require('../ai/vision');
const { randomDelay } = require('../utils');

const DEBUG_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'debug');
const SAVE_DEBUG = process.env.SAVE_DEBUG_SCREENSHOTS !== 'false';

// Max innerText length sent to AI (~60k chars ≈ ~15k tokens)
const MAX_TEXT_LENGTH = 60_000;

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant. You receive two inputs from a Facebook profile page:

1. PAGE TEXT — the full visible text of the page (innerText). Contains post bodies, author names, timestamps, and UI labels mixed together.
2. POST URLS — an ordered list of post share URLs collected by clicking each Share button on the page, in the order they appear top to bottom.

Your job: return every post as a JSON array, correlating URLs with post content from the text.

CRITICAL RULES:
1. Return ONLY a valid JSON array. No markdown, no prose, no code fences.
2. Your entire response must be a JSON object: {"posts": [...]}.
3. Each element must have exactly these fields: url, text, author, timestamp.
4. Use null for any field you cannot determine.
5. "url" — assign URLs from POST URLS in order (first URL = first post, second = second post, etc.).
6. "text" — the actual post body. Exclude UI labels: Like, Comment, Share, Follow, Add friend, etc.
7. "author" — name of the person or page who wrote the post.
8. "timestamp" — date/time as it appears in the text (e.g. "April 5 at 10:00 AM", "2h", "Yesterday").
9. If there are no posts, return: {"posts":[]}`;

async function saveStepScreenshot(page, options, stepLabel) {
  if (!SAVE_DEBUG) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const label = [options.avatar, options.platform, stepLabel].filter(Boolean).join('-');
    const filepath = path.join(DEBUG_DIR, `${ts}-${label}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`[scrape] Debug screenshot: ${filepath}`);
  } catch (e) {
    console.warn('[scrape] Could not save debug screenshot:', e.message);
  }
}

async function dismissFacebookCookieBanner(page) {
  const selectors = [
    'button:has-text("Decline optional cookies")',
    'button:has-text("Decline")',
    'button[title="Decline optional cookies"]',
    '[aria-label="Close"]',
  ];
  for (const selector of selectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        console.log(`[scrape] Cookie banner dismissed via: ${selector}`);
        await randomDelay(800, 1500);
        return;
      }
    } catch { /* try next */ }
  }
}

async function isLoginWall(page) {
  const url = page.url();
  if (url.includes('/login') || url.includes('login_attempt')) return true;
  return page.evaluate(() => {
    if (document.querySelector('input[name="email"], input[name="pass"], form#login_form')) return true;
    return Array.from(document.querySelectorAll('a, button'))
      .some((el) => /^log\s*in$/i.test(el.innerText?.trim()));
  });
}

// How many times to scroll down looking for more posts
const MAX_SCROLL_ROUNDS = 5;

/**
 * Waits for the first MAWFetchXMAData_fetchXmaPreviewDataQuery request after
 * a share button click and resolves with the URL. Resolves null on timeout.
 * Using a per-click promise ensures we capture exactly ONE URL per click,
 * preventing duplicates from multiple requests firing on the same click.
 */
function waitForShareUrl(page, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      page.off('request', handler);
      resolve(null);
    }, timeoutMs);

    const handler = (request) => {
      if (done) return;
      if (request.method() !== 'POST') return;
      if (!request.url().includes('/api/graphql/')) return;
      const body = request.postData() || '';
      if (!body.includes('MAWFetchXMAData_fetchXmaPreviewDataQuery')) return;
      try {
        const params = new URLSearchParams(body);
        const variables = JSON.parse(params.get('variables') || '{}');
        if (variables.url) {
          done = true;
          clearTimeout(timer);
          page.off('request', handler);
          resolve(variables.url);
        }
      } catch { /* malformed, keep waiting */ }
    };

    page.on('request', handler);
  });
}

/**
 * Clicks each Share button, capturing exactly one URL per click.
 * Scrolls down up to MAX_SCROLL_ROUNDS times to load more posts.
 * Tracks already-processed button indices to avoid re-clicking.
 */
async function collectPostUrls(page, limit = null) {
  const urls = [];
  let processedCount = 0;

  for (let round = 0; round <= MAX_SCROLL_ROUNDS; round++) {
    if (limit !== null && urls.length >= limit) break;

    const totalCount = await page.evaluate(() =>
      document.querySelectorAll('[data-ad-rendering-role="share_button"]').length
    );

    const newCount = totalCount - processedCount;
    if (newCount > 0) {
      console.log(`[scrape] Round ${round}: processing ${newCount} new share button(s) (total: ${totalCount})`);
    }

    for (let i = processedCount; i < totalCount; i++) {
      if (limit !== null && urls.length >= limit) break;
      const urlPromise = waitForShareUrl(page);

      const clicked = await page.evaluate((idx) => {
        const marker = document.querySelectorAll('[data-ad-rendering-role="share_button"]')[idx];
        if (!marker) return false;
        const btn = marker.closest('[role="button"]');
        if (!btn) return false;
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return true;
      }, i);

      if (!clicked) {
        console.warn(`[scrape] Share button ${i}: no role="button" ancestor found`);
        continue;
      }

      const url = await urlPromise;
      if (url) {
        urls.push(url);
        console.log(`[scrape] Post ${urls.length}: ${url}`);
      } else {
        console.warn(`[scrape] Share button ${i}: no URL captured (request timed out)`);
      }

      await page.keyboard.press('Escape');
      await randomDelay(400, 700);
    }

    processedCount = totalCount;

    if (round < MAX_SCROLL_ROUNDS) {
      // Scroll down to trigger loading of more posts
      const prevScrollY = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollBy(0, 1200));
      await randomDelay(1500, 2500);
      const newScrollY = await page.evaluate(() => window.scrollY);

      if (newScrollY === prevScrollY) {
        console.log('[scrape] Reached end of page — stopping scroll');
        break;
      }
    }
  }

  console.log(`[scrape] Collected ${urls.length} post URL(s) total`);
  return urls;
}

/**
 * Sends page innerText + ordered post URLs to AI.
 * AI correlates them into structured posts (first URL = first post, etc.)
 */
async function extractPostsWithAI(pageText, urls) {
  const provider = getPrimaryProvider();

  const truncatedText = pageText.length > MAX_TEXT_LENGTH
    ? pageText.slice(0, MAX_TEXT_LENGTH)
    : pageText;

  const userMessage = [
    '## PAGE TEXT',
    truncatedText,
    '',
    '## POST URLS',
    urls.length > 0 ? urls.join('\n') : '(none found)',
  ].join('\n');

  console.log(`[scrape] Sending ${truncatedText.length} chars + ${urls.length} URL(s) to AI`);

  const result = await provider.analyzeText(EXTRACTION_SYSTEM_PROMPT, userMessage);

  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.posts)) return result.posts;
  console.warn('[scrape] AI returned unexpected shape:', JSON.stringify(result)?.slice(0, 300));
  return [];
}

/**
 * Extracts currently visible posts from a Facebook profile/page.
 *
 * Strategy:
 * - Clicks each Share button to trigger Facebook's GraphQL request that
 *   returns the post's shareable URL (no DOM parsing needed for URLs)
 * - Captures page innerText for post content
 * - Sends both to AI to produce structured output
 *
 * No scrolling — only posts visible at the moment of the call.
 *
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} params.profile_url  - Full URL of the Facebook profile or page.
 * @param {string} [params.avatar]     - Avatar name (for logging/debug screenshots).
 * @returns {Promise<{
 *   status: 'ok'|'login_required'|'error',
 *   posts?: Array<{ url: string|null, text: string, author: string|null, timestamp: string|null }>,
 *   error?: string,
 * }>}
 */
async function scrapeProfilePosts(page, { profile_url, avatar, limit = null }) {
  const debugOptions = { avatar: avatar || 'unknown', platform: 'Facebook' };

  try {
    // ── Step 1: Navigate ───────────────────────────────────────────────────
    console.log(`[scrape] Step 1: Navigating to profile: ${profile_url}`);
    await page.goto(profile_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3500);

    // ── Step 2: Dismiss cookie banner ──────────────────────────────────────
    console.log('[scrape] Step 2: Dismissing cookie banner if present');
    await dismissFacebookCookieBanner(page);
    await saveStepScreenshot(page, debugOptions, 'step2-after-cookie');

    // ── Step 3: Login wall check (DOM only, no AI) ─────────────────────────
    console.log('[scrape] Step 3: Checking for login wall');
    if (await isLoginWall(page)) {
      await saveStepScreenshot(page, debugOptions, 'step3-login-wall');
      return { status: 'login_required', error: 'Facebook requires login to view this profile.' };
    }

    // ── Step 4: Wait for posts to render ───────────────────────────────────
    console.log('[scrape] Step 4: Waiting for posts to render');
    try {
      // Wait for the marker to exist in DOM (it's an empty div so visibility check is skipped)
      await page.waitForFunction(
        () => document.querySelectorAll('[data-ad-rendering-role="share_button"]').length > 0,
        { timeout: 10000 }
      );
    } catch {
      console.warn('[scrape] No share buttons found within timeout — page may have no posts or require login.');
    }
    await randomDelay(1000, 2000);
    await saveStepScreenshot(page, debugOptions, 'step4-ready');

    // ── Step 5: Click each Share button, collect post URLs via interception ─
    console.log('[scrape] Step 5: Collecting post URLs via Share button interception');
    const urls = await collectPostUrls(page, limit);
    await saveStepScreenshot(page, debugOptions, 'step5-urls-collected');

    // ── Step 6: Expand truncated posts then grab full page text ───────────
    console.log('[scrape] Step 6: Expanding truncated posts and extracting text');
    const expanded = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[role="button"]'));
      const seeMores = btns.filter((b) => /^see more$/i.test(b.innerText?.trim()));
      seeMores.forEach((b) => b.click());
      return seeMores.length;
    });
    if (expanded > 0) {
      console.log(`[scrape] Expanded ${expanded} "See more" button(s)`);
      await randomDelay(500, 1000);
    }
    const pageText = await page.evaluate(() => document.body.innerText);

    // ── Step 7: AI correlates text + URLs into structured posts ────────────
    console.log('[scrape] Step 7: Sending to AI for extraction');
    const posts = await extractPostsWithAI(pageText, urls);

    await saveStepScreenshot(page, debugOptions, 'step7-done');
    console.log(`[scrape] Extracted ${posts.length} post(s) from ${profile_url}`);

    return { status: 'ok', posts };
  } catch (err) {
    console.error(`[scrape] Unexpected error for ${avatar}:`, err.message);
    return { status: 'error', error: err.message };
  }
}

module.exports = { scrapeProfilePosts };
