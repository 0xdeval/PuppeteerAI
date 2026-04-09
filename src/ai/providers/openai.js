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
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      // Try extracting an array first, then an object
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { return JSON.parse(arrayMatch[0]); } catch { /* fall through */ }
      }
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }
      throw new Error(`Could not parse JSON from OpenAI response: ${rawText.slice(0, 200)}`);
    }
  }

  _isRetryableError(err) {
    if (!err) return false;
    if (err.status === 429 || err.status >= 500) return true;
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
    return false;
  }
}

module.exports = { OpenAIVisionProvider };
