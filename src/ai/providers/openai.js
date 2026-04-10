'use strict';

const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('../prompts');

const DEFAULT_PRIMARY_MODEL = process.env.LLM_MODEL_PRIMARY || 'gpt-4o-mini';
const DEFAULT_FALLBACK_MODEL = process.env.LLM_MODEL_FALLBACK || 'gpt-4o';

class OpenAIVisionProvider {
  constructor(options = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.LLM_API_KEY,
      baseURL: options.baseURL || process.env.LLM_BASE_URL || undefined,
    });
    this.primaryModel = options.primaryModel || DEFAULT_PRIMARY_MODEL;
    this.fallbackModel = options.fallbackModel || DEFAULT_FALLBACK_MODEL;
  }

  /**
   * Analyzes a screenshot with a vision-capable OpenAI model.
   *
   * @param {object} params
   * @param {string} params.imageBase64       - Base64-encoded PNG screenshot.
   * @param {string} params.instruction       - Task-specific instruction for the AI.
   * @param {object} [params.responseSchema]  - Unused; schema described in system prompt.
   * @param {boolean} [params.useFallback]    - Force use of the fallback model.
   * @returns {Promise<object>} Parsed JSON action object.
   */
  async analyze({ imageBase64, instruction, responseSchema, useFallback = false }) {
    const model = useFallback ? this.fallbackModel : this.primaryModel;

    try {
      const response = await this._callApi(model, imageBase64, instruction);
      return this._parseResponse(response);
    } catch (err) {
      if (!useFallback && this._isRetryableError(err)) {
        console.warn(`[openai] Primary model (${model}) failed (${err.message}), trying fallback.`);
        const fallbackResponse = await this._callApi(this.fallbackModel, imageBase64, instruction);
        return this._parseResponse(fallbackResponse);
      }
      throw err;
    }
  }

  async analyzeText(systemPrompt, userMessage) {
    const completion = await this.client.chat.completions.create({
      model: this.primaryModel,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    return this._parseResponse(completion.choices[0].message.content);
  }

  async _callApi(model, imageBase64, instruction) {
    const completion = await this.client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
                detail: 'high',
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

    return completion.choices[0].message.content;
  }

  _parseResponse(rawText) {
    if (!rawText || !rawText.trim()) {
      throw new Error('Model returned empty response');
    }

    const cleaned = rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, '') // strip Qwen3/thinking-model CoT blocks
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    if (!cleaned) {
      throw new Error('Model response was empty after stripping think blocks');
    }

    try {
      return this._normalizeResult(JSON.parse(cleaned));
    } catch {
      // Try extracting an array first, then an object
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { return this._normalizeResult(JSON.parse(arrayMatch[0])); } catch { /* fall through */ }
      }
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return this._normalizeResult(JSON.parse(objectMatch[0]));
      }
      throw new Error(`Could not parse JSON from OpenAI response: ${rawText.slice(0, 200)}`);
    }
  }

  _normalizeResult(result) {
    if (!result || typeof result !== 'object') return result;

    // confidence must be a 0.0–1.0 float
    if (typeof result.confidence === 'string') {
      const words = { high: 0.9, medium: 0.6, low: 0.3 };
      result.confidence = words[result.confidence.toLowerCase()] ?? (parseFloat(result.confidence) || 0.5);
    }

    // x, y, scroll_amount must be numbers or null
    for (const field of ['x', 'y', 'scroll_amount']) {
      if (result[field] !== null && result[field] !== undefined) {
        const n = parseFloat(result[field]);
        result[field] = isNaN(n) ? null : n;
      }
    }

    // action must be one of the allowed values — default to "none" if the model returned something else
    const VALID_ACTIONS = new Set(['click', 'type', 'scroll', 'wait', 'none', 'done', 'error']);
    if (result.action && !VALID_ACTIONS.has(result.action)) {
      console.warn(`[vision] Invalid action "${result.action}" from model — coercing to "none"`);
      result.action = 'none';
    }

    return result;
  }

  _isRetryableError(err) {
    if (!err) return false;
    if (err.status === 429 || err.status >= 500) return true;
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
    return false;
  }
}

module.exports = { OpenAIVisionProvider };
