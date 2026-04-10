'use strict';

const fs = require('fs');
const path = require('path');

const { OpenAIVisionProvider } = require('./openai');
const { SYSTEM_PROMPT } = require('../prompts');

const DEFAULT_OLLAMA_API_KEY = 'ollama';
const OLLAMA_TIMEOUT_MS = 180_000; // vision models can be slow

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');
const DEBUG_DIR = path.join(DATA_DIR, 'debug');

function saveResponseLog(data, label = 'ollama') {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${ts}-${label}-response.json`;
    fs.writeFileSync(path.join(DEBUG_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
    console.log(`[ollama] Response log saved: ${filename}`);
  } catch (err) {
    console.warn('[ollama] Could not save response log:', err.message);
  }
}

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

  // ─── Vision call via /api/chat ────────────────────────────────────────────
  // Ollama recommends /api/chat for qwen3-vl (per ollama.com/library/qwen3-vl).
  // Response format: { message: { role, content, thinking }, done: true, ... }
  // `think: false` disables CoT on Ollama ≥ 0.7 — thinking stays in message.thinking,
  // content is always the clean JSON string.
  // `format: "json"` forces valid JSON output in message.content.

  async _callApi(model, imageBase64, instruction) {
    const data = await this._nativeFetch('/api/chat', {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: instruction, images: [imageBase64] },
      ],
      stream: false,
      format: 'json',
      think: false,
    });

    saveResponseLog(data, model.replace(/[^a-z0-9]/gi, '_'));
    const content = data.message?.content ?? data.response ?? '';
    console.log(`[ollama] Raw content: ${String(content).slice(0, 300)}`);

    return content;
  }

  // ─── Text-only call (used by checkSession etc.) ────────────────────────────

  async analyzeText(systemPrompt, userMessage) {
    const data = await this._nativeFetch('/api/chat', {
      model: this.primaryModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      format: 'json',
      think: false,
    });

    saveResponseLog(data, `${this.primaryModel.replace(/[^a-z0-9]/gi, '_')}-text`);
    const content = data.message?.content ?? data.response ?? '';
    console.log(`[ollama] Raw content (text): ${String(content).slice(0, 300)}`);

    return this._parseResponse(content);
  }
}

module.exports = { OllamaVisionProvider };
