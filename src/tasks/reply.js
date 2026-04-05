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
    console.log(`[reply] Debug screenshot: ${filepath}`);
  } catch (e) {
    console.warn('[reply] Could not save debug screenshot:', e.message);
  }
}

/**
 * Replies to an existing social media post using AI-guided browser automation.
 *
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} params.platform    - e.g. "twitter", "facebook"
 * @param {string} params.post_url    - URL of the post to reply to
 * @param {string} params.text        - Reply text
 * @param {string} [params.avatar]    - Avatar name (for logging)
 * @param {object} llmClient          - Unused directly (aiAction uses global provider)
 * @returns {Promise<{ status: 'posted'|'login_expired'|'error', post_url?: string, error?: string }>}
 */
async function replyToPost(page, { platform, post_url, text, avatar }, llmClient) {
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  const aiOptions = { avatar: avatar || 'unknown', platform: platformLabel };

  try {
    // ── Step 1: Navigate to the target post ─────────────────────────────────
    console.log(`[reply] Step 1: Navigating to post: ${post_url}`);
    await page.goto(post_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1500, 3000);
    await dismissCookieBanner(page);
    await saveStepScreenshot(page, aiOptions, 'step1-navigated');

    // ── Step 2: Verify session ──────────────────────────────────────────────
    console.log('[reply] Step 2: Checking session');
    const session = await checkSession(page, platformLabel, llmClient, { avatar });
    await saveStepScreenshot(page, aiOptions, 'step2-session-check');

    if (!session.logged_in) {
      await saveStepScreenshot(page, aiOptions, 'error-not-logged-in');
      return {
        status: 'login_expired',
        error: session.session_expired
          ? 'Session expired — re-login required.'
          : 'Not logged in — login required.',
      };
    }

    const steps = getTaskSteps('reply_to_post', { platform: platformLabel, avatar });

    // Brief anti-detection pause + small scroll to make post visible
    await randomDelay(500, 1200);
    if (Math.random() > 0.5) {
      await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 150)));
      await randomDelay(400, 800);
    }

    // ── Step 3: Click reply input ───────────────────────────────────────────
    console.log('[reply] Step 3: Finding and clicking reply input');
    const replyBtnStep = steps.find((s) => s.id === 'find_reply_button');
    const replyBtnResult = await aiAction(page, replyBtnStep.instruction, aiOptions);

    if (replyBtnResult.action === 'error') {
      await saveStepScreenshot(page, aiOptions, 'step3-reply-input-error');
      return { status: 'error', error: `Could not find reply input: ${replyBtnResult.reasoning}` };
    }

    // Always click if coordinates provided — even if AI says 'none', clicking
    // the input is necessary to ensure focus before typing
    if (replyBtnResult.x && replyBtnResult.y) {
      await page.mouse.click(replyBtnResult.x, replyBtnResult.y);
    }
    await randomDelay(700, 1500);
    await saveStepScreenshot(page, aiOptions, 'step3-reply-input-clicked');

    // ── Step 4: Confirm reply input is focused ──────────────────────────────
    console.log('[reply] Step 4: Confirming reply input is focused');
    const typeStep = steps.find((s) => s.id === 'type_reply');
    const typeCheck = await aiAction(page, typeStep.instruction, aiOptions);
    await saveStepScreenshot(page, aiOptions, 'step4-input-ready');

    if (typeCheck.action === 'error') {
      return { status: 'error', error: `Reply input not ready: ${typeCheck.reasoning}` };
    }

    if (typeCheck.x && typeCheck.y) {
      await page.mouse.click(typeCheck.x, typeCheck.y);
      await randomDelay(400, 800);
    }

    // ── Step 5: Type reply text ─────────────────────────────────────────────
    // Use execCommand('insertText') to inject the full text into the focused
    // contenteditable element in one shot. This avoids char-by-char autocomplete
    // interference (e.g. apostrophes triggering X's suggestions and eating chars).
    console.log('[reply] Step 5: Typing reply');
    const typed = await page.evaluate((replyText) => {
      const el = document.activeElement;
      if (!el) return false;
      return document.execCommand('insertText', false, replyText);
    }, text);

    if (!typed) {
      // execCommand not supported on this element — fall back to keyboard.type
      console.warn('[reply] execCommand failed, falling back to keyboard.type');
      await page.keyboard.type(text);
    }

    await randomDelay(600, 1400);
    await saveStepScreenshot(page, aiOptions, 'step5-typed');

    // ── Step 6: Submit reply ────────────────────────────────────────────────
    console.log('[reply] Step 6: Submitting reply');
    const submitStep = steps.find((s) => s.id === 'submit_reply');
    const submitResult = await aiAction(page, submitStep.instruction, aiOptions);
    await saveStepScreenshot(page, aiOptions, 'step6-before-submit');

    if (submitResult.action === 'error') {
      return { status: 'error', error: `Could not find reply submit button: ${submitResult.reasoning}` };
    }

    if (submitResult.x && submitResult.y) {
      await page.mouse.click(submitResult.x, submitResult.y);
    } else {
      // Fallback: keyboard shortcut works in both inline and modal compose on X
      await page.keyboard.press('Control+Enter');
    }

    await randomDelay(2000, 4000);
    await saveStepScreenshot(page, aiOptions, 'step6-after-submit');

    // ── Step 7: Verify reply posted ─────────────────────────────────────────
    console.log('[reply] Step 7: Verifying reply');
    const verifyStep = steps.find((s) => s.id === 'verify_reply');
    const verifyResult = await aiAction(page, verifyStep.instruction, aiOptions);
    await saveStepScreenshot(page, aiOptions, 'step7-verify');

    if (verifyResult.status === 'post_success' || verifyResult.confidence >= 0.8) {
      console.log(`[reply] Successfully replied for ${avatar} on ${platform}`);
      await saveStepScreenshot(page, aiOptions, 'proof-replied');
      return {
        status: 'posted',
        post_url: verifyResult.post_url || null,
      };
    }

    if (verifyResult.status === 'session_expired' || verifyResult.status === 'logged_out') {
      await saveStepScreenshot(page, aiOptions, 'error-session-expired');
      return { status: 'login_expired', error: 'Session expired during reply.' };
    }

    return {
      status: 'error',
      error: verifyResult.reasoning || 'Reply verification failed — unknown outcome.',
    };
  } catch (err) {
    console.error(`[reply] Unexpected error for ${avatar} on ${platform}:`, err.message);
    return {
      status: 'error',
      error: err.message,
    };
  }
}

module.exports = { replyToPost };
