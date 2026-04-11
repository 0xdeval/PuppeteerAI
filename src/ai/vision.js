'use strict';

const fs = require('fs');
const path = require('path');

const { AnthropicVisionProvider } = require('./providers/anthropic');
const { OpenAIVisionProvider } = require('./providers/openai');
const { OllamaVisionProvider } = require('./providers/ollama');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DEBUG_DIR = path.join(DATA_DIR, 'debug');
const MAX_AI_RETRIES = parseInt(process.env.MAX_AI_RETRIES || '3', 10);
const SAVE_DEBUG_SCREENSHOTS = process.env.SAVE_DEBUG_SCREENSHOTS !== 'false';
const CONFIDENCE_THRESHOLD = 0.7; // below this → escalate to fallback model

// ─── Provider Factory ─────────────────────────────────────────────────────────

let _primaryProvider = null;
let _fallbackProvider = null;

function buildProvider(providerName, options = {}) {
  const name = (providerName || '').toLowerCase();
  if (name === 'openai') {
    return new OpenAIVisionProvider(options);
  }
  if (name === 'ollama') {
    return new OllamaVisionProvider(options);
  }
  // Default: anthropic
  return new AnthropicVisionProvider(options);
}

function getPrimaryProvider() {
  if (!_primaryProvider) {
    const providerName = process.env.LLM_PROVIDER;
    // LLM_BASE_URL is only meaningful for Ollama/OpenAI-compat providers.
    // Don't pass it to Anthropic — it would route requests to the wrong host.
    const isOllamaOrOpenAI = providerName === 'ollama' || providerName === 'openai';
    _primaryProvider = buildProvider(providerName, {
      apiKey: process.env.LLM_API_KEY,
      ...(isOllamaOrOpenAI && process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : {}),
    });
  }
  return _primaryProvider;
}

function getFallbackProvider() {
  if (!_fallbackProvider) {
    const providerName = process.env.LLM_FALLBACK_PROVIDER || process.env.LLM_PROVIDER;
    const isOllamaOrOpenAI = providerName === 'ollama' || providerName === 'openai';
    _fallbackProvider = buildProvider(providerName, {
      apiKey: process.env.LLM_FALLBACK_API_KEY || process.env.LLM_API_KEY,
      ...(isOllamaOrOpenAI && process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : {}),
      primaryModel: process.env.LLM_MODEL_FALLBACK,
      fallbackModel: process.env.LLM_MODEL_FALLBACK,
    });
  }
  return _fallbackProvider;
}

// ─── Debug Screenshot ─────────────────────────────────────────────────────────

async function saveDebugScreenshot(page, label) {
  if (!SAVE_DEBUG_SCREENSHOTS) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${label}.png`;
    const filepath = path.join(DEBUG_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    console.warn(`[vision] Debug screenshot saved: ${filepath}`);
  } catch (err) {
    console.warn('[vision] Could not save debug screenshot:', err.message);
  }
}

// ─── Core Action Function ─────────────────────────────────────────────────────

/**
 * Takes a screenshot of the current page, sends it to the configured LLM provider,
 * and returns the parsed action object.
 *
 * Implements retry logic with escalation to the fallback model on low confidence.
 *
 * @param {import('playwright').Page} page
 * @param {string} instruction      - Task-specific instruction string.
 * @param {object} [options]
 * @param {string} [options.avatar]   - Avatar name for debug labels.
 * @param {string} [options.platform] - Platform name for debug labels.
 * @param {number} [options.maxRetries]
 * @returns {Promise<object>} The AI action object.
 */
async function aiAction(page, instruction, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_AI_RETRIES;
  const label = [options.avatar, options.platform].filter(Boolean).join('-') || 'unknown';

  let lastError = null;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // scale:'css' forces the screenshot to always be 1:1 with CSS pixels regardless of
      // deviceScaleFactor. Without this, a Retina/HiDPI display produces a 2× screenshot
      // whose coordinates don't match what Playwright uses for page.mouse.click().
      const screenshotBuffer = await page.screenshot({ fullPage: false, scale: 'css' });
      const imageBase64 = screenshotBuffer.toString('base64');

      const viewport = page.viewportSize();

      // Log screenshot dimensions once per session so mismatches are immediately visible.
      if (attempt === 1) {
        // PNG header: width at bytes 16-19, height at 20-23
        const imgWidth = screenshotBuffer.readUInt32BE(16);
        const imgHeight = screenshotBuffer.readUInt32BE(20);
        if (viewport && (imgWidth !== viewport.width || imgHeight !== viewport.height)) {
          console.warn(`[vision] Screenshot size (${imgWidth}×${imgHeight}) does not match viewport (${viewport.width}×${viewport.height}) — coordinate mismatch!`);
        } else if (viewport) {
          console.log(`[vision] Screenshot: ${imgWidth}×${imgHeight} (matches viewport)`);
        }
      }

      // Decide which provider to use
      const useFallback = attempt > 1;
      const provider = useFallback ? getFallbackProvider() : getPrimaryProvider();

      console.log(`[vision] Attempt ${attempt}/${maxRetries} using ${useFallback ? 'fallback' : 'primary'} provider.`);

      const result = await provider.analyze({
        imageBase64,
        instruction,
        viewport,
        useFallback: attempt > Math.ceil(maxRetries / 2), // escalate to fallback model after half retries
      });

      lastResult = result;

      // Validate the result has the required fields
      if (!result || typeof result !== 'object') {
        throw new Error('AI returned non-object response.');
      }

      if (typeof result.confidence !== 'number') {
        result.confidence = 0.5; // default if missing
      }

      // Low confidence: escalate to fallback on next attempt
      if (result.confidence < CONFIDENCE_THRESHOLD && attempt < maxRetries) {
        console.warn(`[vision] Low confidence (${result.confidence}) on attempt ${attempt}. Retrying with fallback.`);
        lastError = new Error(`Low confidence: ${result.confidence}`);
        continue;
      }

      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[vision] Attempt ${attempt} failed: ${err.message}`);

      if (attempt < maxRetries) {
        // Wait briefly before retry (exponential backoff)
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  // All retries exhausted
  await saveDebugScreenshot(page, label);

  // Return last result with low confidence rather than throwing, so callers can handle gracefully
  if (lastResult) {
    console.error(`[vision] All retries exhausted. Returning last result with low confidence.`);
    lastResult.confidence = 0;
    lastResult.reasoning = `All ${maxRetries} retries failed. Last error: ${lastError?.message}`;
    return lastResult;
  }

  throw new Error(`AI action failed after ${maxRetries} attempts: ${lastError?.message}`);
}

module.exports = { aiAction, getPrimaryProvider };
