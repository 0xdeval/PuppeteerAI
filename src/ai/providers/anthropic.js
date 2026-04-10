'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('../prompts');

const DEFAULT_PRIMARY_MODEL = process.env.LLM_MODEL_PRIMARY || 'claude-haiku-4-5-20251001';
const DEFAULT_FALLBACK_MODEL = process.env.LLM_MODEL_FALLBACK || 'claude-sonnet-4-20250514';

class AnthropicVisionProvider {
  constructor(options = {}) {
    // Only override baseURL when explicitly provided via options (not from the shared
    // LLM_BASE_URL env var, which is an Ollama/OpenAI-compat endpoint and would cause 404s).
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.LLM_API_KEY,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
    this.primaryModel = options.primaryModel || DEFAULT_PRIMARY_MODEL;
    this.fallbackModel = options.fallbackModel || DEFAULT_FALLBACK_MODEL;
  }

  /**
   * Sends a text-only message to Claude and returns the parsed JSON response.
   * Used for HTML extraction tasks where no screenshot is needed.
   *
   * @param {string} systemPrompt  - System instruction.
   * @param {string} userMessage   - User message (e.g. cleaned HTML + extraction instruction).
   * @param {boolean} [useFallback]
   * @returns {Promise<any>} Parsed JSON.
   */
  async analyzeText(systemPrompt, userMessage, useFallback = false) {
    const model = useFallback ? this.fallbackModel : this.primaryModel;

    const message = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    return this._parseResponse(message.content[0].text);
  }

  /**
   * Analyzes a screenshot with a vision-capable Claude model.
   *
   * @param {object} params
   * @param {string} params.imageBase64       - Base64-encoded PNG screenshot.
   * @param {string} params.instruction       - Task-specific instruction for the AI.
   * @param {object} [params.responseSchema]  - Unused directly; schema is described in system prompt.
   * @param {boolean} [params.useFallback]    - Force use of the fallback model.
   * @returns {Promise<object>} Parsed JSON action object.
   */
  async analyze({ imageBase64, instruction, responseSchema, useFallback = false }) {
    const model = useFallback ? this.fallbackModel : this.primaryModel;

    // Retry the chosen model up to 2 times with backoff before falling back
    const maxAttempts = 2;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this._callApi(model, imageBase64, instruction);
        return this._parseResponse(response);
      } catch (err) {
        lastErr = err;
        if (!this._isRetryableError(err)) throw err;
        if (attempt < maxAttempts) {
          // Exponential backoff: 2s, 4s…
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }

    // All retries exhausted — escalate to fallback model (only when not already using it)
    if (!useFallback && this.fallbackModel !== model) {
      console.warn(`[anthropic] Primary model (${model}) failed (${lastErr.message}), trying fallback.`);
      const fallbackResponse = await this._callApi(this.fallbackModel, imageBase64, instruction);
      return this._parseResponse(fallbackResponse);
    }

    throw lastErr;
  }

  async _callApi(model, imageBase64, instruction) {
    const message = await this.client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: instruction,
            },
          ],
        },
      ],
    });

    return message.content[0].text;
  }

  _parseResponse(rawText) {
    // Strip any accidental markdown code fences
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      // Attempt to extract JSON object from mixed content
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error(`Could not parse JSON from Anthropic response: ${rawText.slice(0, 200)}`);
    }
  }

  _isRetryableError(err) {
    if (!err) return false;
    // Rate limits, server errors, overload
    if (err.status === 429 || err.status === 529 || err.status >= 500) return true;
    // Network / timeout errors
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
    return false;
  }
}

module.exports = { AnthropicVisionProvider };
