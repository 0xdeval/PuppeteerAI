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
  const isFacebook = platform.toLowerCase() === 'facebook';
  const deferTypingUntilAfterImage = isFacebook && !!imagePath;

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

    // Facebook posting relies on the top-of-feed "What's on your mind?" entry point.
    // Always return to top after anti-detection movement.
    if (isFacebook) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await randomDelay(700, 1500);
    }

    const steps = getTaskSteps('create_post', { platform: platformLabel, avatar });

    // ── Step 3: Find and click "What's on your mind" input ─────────────────
    console.log('[post] Step 3: Finding post input field');
    const composeStep = steps.find((s) => s.id === 'find_compose_button');
    let composeResult = await aiAction(page, composeStep.instruction, aiOptions);

    // If page is still loading, wait and retry once
    if (composeResult.action === 'wait') {
      console.log('[post] Step 3: Page still loading, waiting...');
      await randomDelay(3000, 5000);
      composeResult = await aiAction(page, composeStep.instruction, aiOptions);
    }

    // Allow the model to recover by scrolling to reveal top-of-feed input.
    if (composeResult.action === 'scroll') {
      const amount = Math.max(200, Math.min(1200, composeResult.scroll_amount || 700));
      const direction = composeResult.scroll_direction === 'up' ? -1 : 1;
      await page.evaluate((dy) => window.scrollBy(0, dy), direction * amount);
      await randomDelay(800, 1500);
      composeResult = await aiAction(page, composeStep.instruction, aiOptions);
    }

    await saveStepScreenshot(page, aiOptions, 'step3-before-click');

    if (composeResult.action === 'error') {
      return { status: 'error', error: `Could not find post input field: ${composeResult.reasoning}` };
    }

    if (composeResult.action === 'click' && composeResult.x && composeResult.y) {
      // For Facebook the "What's on your mind" bar lives in the top navigation bar (y ≈ 20–55).
      // If the model returned a y > 80 it almost certainly pointed at the Stories row instead.
      if (isFacebook && composeResult.y > 80) {
        console.warn(`[post] Step 3: Suspicious y-coordinate (${composeResult.y}) — likely pointed at Stories row instead of nav bar input. Expected y < 80.`);
      }

      // Log what element is actually at the target coordinates before clicking.
      // This tells us immediately whether the AI pointed to the right element or missed.
      const elemAtCoords = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        return {
          tag: el.tagName,
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          text: el.textContent?.trim().slice(0, 80),
        };
      }, { x: composeResult.x, y: composeResult.y }).catch(() => null);
      console.log(`[post] Step 3: Clicking at (${composeResult.x}, ${composeResult.y}), element at coords: ${JSON.stringify(elemAtCoords)}`);

      await page.mouse.click(composeResult.x, composeResult.y);
      await saveStepScreenshot(page, aiOptions, 'step3-after-click');
      await randomDelay(isFacebook ? 2000 : 600, isFacebook ? 3000 : 1500);
    }

    // For Facebook: re-run find_compose_button to verify the dialog actually opened (STATE B).
    // If the AI still returns STATE A (click), retry with the new coordinates it provides.
    if (isFacebook) {
      const verifyOpen = await aiAction(page, composeStep.instruction, aiOptions);
      await saveStepScreenshot(page, aiOptions, 'step3-verify-open');

      if (verifyOpen.action === 'click' && verifyOpen.x && verifyOpen.y) {
        const elemAtRetry = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return null;
          return {
            tag: el.tagName,
            role: el.getAttribute('role'),
            ariaLabel: el.getAttribute('aria-label'),
            text: el.textContent?.trim().slice(0, 80),
          };
        }, { x: verifyOpen.x, y: verifyOpen.y }).catch(() => null);
        console.log(`[post] Step 3: Dialog not open — retry click at (${verifyOpen.x}, ${verifyOpen.y}), element: ${JSON.stringify(elemAtRetry)}`);

        await page.mouse.click(verifyOpen.x, verifyOpen.y);
        await saveStepScreenshot(page, aiOptions, 'step3-retry-after-click');
        await randomDelay(2000, 3000);
      } else {
        console.log('[post] Step 3: AI confirms dialog is open');
      }
    }

    // ── Step 4: Type post text ──────────────────────────────────────────────
    console.log(
      deferTypingUntilAfterImage
        ? '[post] Step 4: Focusing post text area (typing deferred until after image)'
        : '[post] Step 4: Typing post text'
    );

    // Wait for compose modal/area to fully render before checking
    await randomDelay(1000, 2000);

    const typeStep = steps.find((s) => s.id === 'type_post_text');
    let typeCheck = await aiAction(page, typeStep.instruction, aiOptions);

    if (typeCheck.action === 'scroll') {
      const amount = Math.max(200, Math.min(1200, typeCheck.scroll_amount || 700));
      const direction = typeCheck.scroll_direction === 'up' ? -1 : 1;
      await page.evaluate((dy) => window.scrollBy(0, dy), direction * amount);
      await randomDelay(800, 1500);
      typeCheck = await aiAction(page, typeStep.instruction, aiOptions);
    }

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

    if (page.isClosed()) {
      return { status: 'error', error: 'Page closed unexpectedly — proxy may have dropped the connection.' };
    }

    if (typeCheck.action === 'click' && typeCheck.x && typeCheck.y) {
      const elemAtType = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        return {
          tag: el.tagName,
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          text: el.textContent?.trim().slice(0, 80),
        };
      }, { x: typeCheck.x, y: typeCheck.y }).catch(() => null);
      console.log(`[post] Step 4: Clicking text area at (${typeCheck.x}, ${typeCheck.y}), element: ${JSON.stringify(elemAtType)}`);
      await page.mouse.click(typeCheck.x, typeCheck.y);
      await randomDelay(400, 800);
    }

    if (page.isClosed()) {
      return { status: 'error', error: 'Browser timed out before typing could start — increase MAX_BROWSER_TIMEOUT.' };
    }

    if (!deferTypingUntilAfterImage) {
      await humanType(page, text);
      await randomDelay(500, 1200);
      await saveStepScreenshot(page, aiOptions, 'step4-typed');
    } else {
      await saveStepScreenshot(page, aiOptions, 'step4-compose-ready');
    }

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

    // On Facebook, typing before image attach can be lost. Type after image attach.
    if (deferTypingUntilAfterImage) {
      console.log('[post] Step 6b: Typing text after image attach');
      let postAttachTypeCheck = await aiAction(page, typeStep.instruction, aiOptions);

      if (postAttachTypeCheck.action === 'error') {
        await randomDelay(1200, 2200);
        postAttachTypeCheck = await aiAction(page, typeStep.instruction, aiOptions);
      }

      if (postAttachTypeCheck.action === 'error') {
        await saveStepScreenshot(page, aiOptions, 'step6b-compose-not-ready');
        return { status: 'error', error: `Compose area not ready after image attach: ${postAttachTypeCheck.reasoning}` };
      }

      if (postAttachTypeCheck.action === 'click' && postAttachTypeCheck.x && postAttachTypeCheck.y) {
        await page.mouse.click(postAttachTypeCheck.x, postAttachTypeCheck.y);
        await randomDelay(400, 800);
      }

      await humanType(page, text);
      await randomDelay(500, 1200);
      await saveStepScreenshot(page, aiOptions, 'step6b-typed-after-image');
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
    await saveStepScreenshot(page, aiOptions, 'error-unexpected').catch(() => {});

    // Don't mark as login_expired for unexpected errors
    return {
      status: 'error',
      error: err.message,
    };
  }
}

module.exports = { postContent };
