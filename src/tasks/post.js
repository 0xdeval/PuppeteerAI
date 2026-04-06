'use strict';

const fs = require('fs');
const path = require('path');
const { aiAction } = require('../ai/vision');
const { getTaskSteps } = require('../ai/prompts');
const { checkSession } = require('./session');
const { humanType, randomDelay, dismissCookieBanner } = require('../utils');

const DEBUG_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'debug');
const SAVE_DEBUG = process.env.SAVE_DEBUG_SCREENSHOTS !== 'false';

async function saveStepScreenshot(page, options, stepLabel) {
  if (!SAVE_DEBUG) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const label = [options.avatar, options.platform, stepLabel].filter(Boolean).join('-');
    const filepath = path.join(DEBUG_DIR, `${ts}-${label}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`[post] Debug screenshot: ${filepath}`);
  } catch (e) {
    console.warn('[post] Could not save debug screenshot:', e.message);
  }
}

const PLATFORM_HOME_URLS = {
  twitter: 'https://twitter.com/home',
  x: 'https://x.com/home',
  facebook: 'https://www.facebook.com/',
};

/**
 * Posts content to a social media platform using AI-guided browser automation.
 *
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} params.platform    - e.g. "twitter", "facebook"
 * @param {string} params.text        - Post text content
 * @param {string} [params.imagePath] - Absolute path to a local image file to attach
 * @param {string} [params.avatar]    - Avatar name (for logging)
 * @param {object} llmClient          - Unused directly (aiAction uses global provider)
 * @returns {Promise<{ status: 'posted'|'login_expired'|'error', post_url?: string, error?: string }>}
 */
async function postContent(page, { platform, text, imagePath, avatar }, llmClient) {
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  const aiOptions = { avatar: avatar || 'unknown', platform: platformLabel };

  try {
    // ── Step 1: Verify session ──────────────────────────────────────────────
    console.log(`[post] Step 1: Checking session for ${avatar} on ${platform}`);

    const homeUrl = PLATFORM_HOME_URLS[platform.toLowerCase()] || `https://${platform}.com/`;
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2500);
    await dismissCookieBanner(page);
    await saveStepScreenshot(page, aiOptions, 'step1-navigated');

    // URL-based check: if X redirected us away from /home, cookies aren't working
    const finalUrl = page.url();
    console.log(`[post] Landed on: ${finalUrl}`);
    if (finalUrl.includes('/login') || finalUrl.includes('/flow/login') || finalUrl.includes('signin')) {
      console.log(`[post] Redirected to login page — cookies invalid or expired`);
      await saveStepScreenshot(page, aiOptions, 'error-redirected-to-login');
      return { status: 'login_expired', error: 'Redirected to login page. Cookies are invalid or expired — re-import auth_token and ct0.' };
    }

    const session = await checkSession(page, platformLabel, llmClient, { avatar });
    await saveStepScreenshot(page, aiOptions, 'step1-session-check');

    if (!session.logged_in) {
      console.log(`[post] Session check failed: ${session.reasoning}`);
      await saveStepScreenshot(page, aiOptions, 'error-not-logged-in');
      return {
        status: 'login_expired',
        error: 'Not logged in — cookies may be expired. Re-import auth_token and ct0.',
      };
    }

    // ── Step 2: Anti-detection scroll on home ───────────────────────────────
    console.log('[post] Step 2: Anti-detection scroll');
    if (Math.random() > 0.4) { // 60 % of the time
      await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300 + 100)));
      await randomDelay(800, 2000);
      await page.evaluate(() => window.scrollBy(0, -Math.floor(Math.random() * 200)));
      await randomDelay(500, 1200);
    }

    const steps = getTaskSteps('create_post', { platform: platformLabel, avatar });

    // ── Step 3: Find and click compose button ───────────────────────────────
    console.log('[post] Step 3: Finding compose button');
    const composeStep = steps.find((s) => s.id === 'find_compose_button');
    let composeResult = await aiAction(page, composeStep.instruction, aiOptions);

    // If page is still loading, wait and retry once
    if (composeResult.action === 'wait') {
      console.log('[post] Step 3: Page still loading, waiting...');
      await randomDelay(3000, 5000);
      composeResult = await aiAction(page, composeStep.instruction, aiOptions);
    }

    await saveStepScreenshot(page, aiOptions, 'step3-find-compose');

    if (composeResult.action === 'error') {
      return { status: 'error', error: `Could not find compose button: ${composeResult.reasoning}` };
    }

    if (composeResult.action === 'click' && composeResult.x && composeResult.y) {
      await page.mouse.click(composeResult.x, composeResult.y);
      await randomDelay(600, 1500);
    }

    // ── Step 4: Type post text ──────────────────────────────────────────────
    console.log('[post] Step 4: Typing post text');

    // Wait for compose modal/area to fully render before checking
    await randomDelay(2000, 3500);

    const typeStep = steps.find((s) => s.id === 'type_post_text');
    let typeCheck = await aiAction(page, typeStep.instruction, aiOptions);

    // If AI can't find the compose area, wait longer and retry once
    if (typeCheck.action === 'error') {
      console.log('[post] Compose area not ready, waiting and retrying...');
      await saveStepScreenshot(page, aiOptions, 'step4-compose-not-ready');
      await randomDelay(2000, 3000);
      typeCheck = await aiAction(page, typeStep.instruction, aiOptions);
    }

    if (typeCheck.action === 'error') {
      await saveStepScreenshot(page, aiOptions, 'step4-compose-failed');
      return { status: 'error', error: `Compose area not ready: ${typeCheck.reasoning}` };
    }

    if (typeCheck.action === 'click' && typeCheck.x && typeCheck.y) {
      await page.mouse.click(typeCheck.x, typeCheck.y);
      await randomDelay(400, 800);
    }

    // Type text with human-like behaviour
    await humanType(page, text);
    await randomDelay(500, 1200);
    await saveStepScreenshot(page, aiOptions, 'step4-typed');

    // ── Step 5 & 6: Attach image (if provided) ──────────────────────────────
    if (imagePath) {
      console.log('[post] Step 5: Attaching image');

      const attachStep = steps.find((s) => s.id === 'attach_image');
      const attachResult = await aiAction(page, attachStep.instruction, aiOptions);
      await saveStepScreenshot(page, aiOptions, 'step5-attach-image');

      if (attachResult.status !== 'image_attached') {
        if (attachResult.action === 'click' && attachResult.x && attachResult.y) {
          await page.mouse.click(attachResult.x, attachResult.y);
          await randomDelay(400, 800);
        }

        try {
          const fileInput = page.locator('input[type="file"]').first();
          await fileInput.setInputFiles(imagePath, { timeout: 10000 });
          console.log('[post] Step 5: Image set via file input');
        } catch (fileErr) {
          console.warn('[post] Could not set file input:', fileErr.message);
        }

        await randomDelay(1500, 3000);

        console.log('[post] Step 6: Verifying image upload');
        const verifyImageStep = steps.find((s) => s.id === 'verify_image');
        const verifyImageResult = await aiAction(page, verifyImageStep.instruction, aiOptions);
        await saveStepScreenshot(page, aiOptions, 'step6-verify-image');

        if (verifyImageResult.action === 'error') {
          console.warn('[post] Image verification failed:', verifyImageResult.reasoning);
        }
      }
    }

    // ── Step 7: Click post button ───────────────────────────────────────────
    console.log('[post] Step 7: Clicking post button');
    await randomDelay(500, 1200);

    const postBtnStep = steps.find((s) => s.id === 'click_post_button');
    const postBtnResult = await aiAction(page, postBtnStep.instruction, aiOptions);
    await saveStepScreenshot(page, aiOptions, 'step7-before-submit');

    if (postBtnResult.action === 'error') {
      return { status: 'error', error: `Could not find post button: ${postBtnResult.reasoning}` };
    }

    if (postBtnResult.action === 'click' && postBtnResult.x && postBtnResult.y) {
      await page.mouse.click(postBtnResult.x, postBtnResult.y);
    } else if (postBtnResult.action !== 'none') {
      await page.keyboard.press('Control+Enter');
    }

    await randomDelay(2000, 4000);
    await saveStepScreenshot(page, aiOptions, 'step7-after-submit');

    // ── Step 8: Verify post success ─────────────────────────────────────────
    console.log('[post] Step 8: Verifying post');
    const verifyPostStep = steps.find((s) => s.id === 'verify_post');
    const verifyPostResult = await aiAction(page, verifyPostStep.instruction, aiOptions);
    await saveStepScreenshot(page, aiOptions, 'step8-verify');

    if (verifyPostResult.status === 'post_success' || verifyPostResult.confidence >= 0.8) {
      console.log(`[post] Successfully posted for ${avatar} on ${platform}`);
      await saveStepScreenshot(page, aiOptions, 'proof-posted');
      return {
        status: 'posted',
        post_url: verifyPostResult.post_url || null,
      };
    }

    if (verifyPostResult.status === 'session_expired' || verifyPostResult.status === 'logged_out') {
      await saveStepScreenshot(page, aiOptions, 'error-session-expired');
      return { status: 'login_expired', error: 'Session expired during posting.' };
    }

    return {
      status: 'error',
      error: verifyPostResult.reasoning || 'Post verification failed — unknown outcome.',
    };
  } catch (err) {
    console.error(`[post] Unexpected error for ${avatar} on ${platform}:`, err.message);

    // Don't mark as login_expired for unexpected errors
    return {
      status: 'error',
      error: err.message,
    };
  }
}

module.exports = { postContent };
