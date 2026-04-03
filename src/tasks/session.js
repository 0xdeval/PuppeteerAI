'use strict';

const { aiAction } = require('../ai/vision');
const { getTaskSteps } = require('../ai/prompts');
const { randomDelay } = require('../utils');

/**
 * Checks whether the current browser session is logged in.
 *
 * @param {import('playwright').Page} page
 * @param {string} platform   - e.g. "X/Twitter" or "Facebook"
 * @param {object} llmClient  - Unused directly; aiAction uses the global provider.
 * @param {object} [options]
 * @param {string} [options.avatar]  - Avatar name for debug labels.
 * @returns {Promise<{ logged_in: boolean, confidence: number, reasoning: string, status: string }>}
 */
async function checkSession(page, platform, llmClient, options = {}) {
  const avatar = options.avatar || 'unknown';

  // Give the page a moment to settle before taking the screenshot
  await randomDelay(500, 1500);

  const steps = getTaskSteps('check_session', { platform, avatar });
  const step = steps[0]; // check_session has only one step

  const result = await aiAction(page, step.instruction, { avatar, platform });

  const logged_in =
    result.status === 'logged_in' ||
    (result.confidence >= 0.7 && result.observation && /logged.?in|home.?feed|compose|tweet|post/i.test(result.observation));

  const session_expired = result.status === 'session_expired';

  return {
    logged_in,
    session_expired,
    confidence: result.confidence || 0,
    reasoning: result.reasoning || result.observation || '',
    status: result.status || (logged_in ? 'logged_in' : 'logged_out'),
  };
}

module.exports = { checkSession };
