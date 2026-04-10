'use strict';

const { OpenAIVisionProvider } = require('./openai');
const { SYSTEM_PROMPT } = require('../prompts');

const DEFAULT_OLLAMA_API_KEY = 'ollama';
const OLLAMA_TIMEOUT_MS = 180_000; // vision models can be slow

class OllamaVisionProvider extends OpenAIVisionProvider {
  constructor(options = {}) {
    const baseURL = options.baseURL || process.env.LLM_BASE_URL;
    const primaryModel = options.primaryModel || process.env.LLM_MODEL_PRIMARY;
    const fallbackModel = options.fallbackModel || process.env.LLM_MODEL_FALLBACK || primaryModel;

    if (!baseURL) {
      throw new Error(
        '[ollama] LLM_BASE_URL is required when LLM_PROVIDER=ollama (example: http://127.0.0.1:11434/v1).'
      );
    }

    if (!primaryModel) {
      throw new Error('[ollama] LLM_MODEL_PRIMARY is required when LLM_PROVIDER=ollama.');
    }

    super({
      ...options,
      apiKey: options.apiKey || process.env.LLM_API_KEY || DEFAULT_OLLAMA_API_KEY,
      baseURL,
      primaryModel,
      fallbackModel,
    });

    // Derive native Ollama base URL by stripping the /v1 suffix added for OpenAI compat.
    // e.g. http://ollama:11434/v1  →  http://ollama:11434
    this._nativeBase = baseURL.replace(/\/v1\/?$/, '');
  }

  // ─── Native API helpers ────────────────────────────────────────────────────

  async _nativeFetch(endpoint, body) {
    const url = `${this._nativeBase}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama native API error ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  }

  // ─── Vision call via /api/generate ────────────────────────────────────────
  // Uses the native format shown by qwen3-vl:8b:
  //   { response: "<clean json>", thinking: "<cot>", done: true, ... }
  // The `think: false` flag disables CoT output on Ollama ≥ 0.7.
  // `format: "json"` forces valid JSON in `response`.

  async _callApi(model, imageBase64, instruction) {
    const data = await this._nativeFetch('/api/generate', {
      model,
      system: SYSTEM_PROMPT,
      prompt: instruction,
      images: [imageBase64],
      stream: false,
      format: 'json',
      think: false,
    });

    // Native format: data.response is the clean JSON string.
    // Fall back to message.content for /api/chat-style responses.
    return data.response ?? data.message?.content ?? '';
  }

  // ─── Text-only call (used by checkSession etc.) ────────────────────────────

  async analyzeText(systemPrompt, userMessage) {
    const data = await this._nativeFetch('/api/generate', {
      model: this.primaryModel,
      system: systemPrompt,
      prompt: userMessage,
      stream: false,
      format: 'json',
      think: false,
    });

    return this._parseResponse(data.response ?? data.message?.content ?? '');
  }
}

module.exports = { OllamaVisionProvider };
