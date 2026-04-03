'use strict';

const { OpenAIVisionProvider } = require('./openai');

const DEFAULT_OLLAMA_API_KEY = 'ollama';

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
      // OpenAI SDK requires an apiKey value; Ollama ignores it.
      apiKey: options.apiKey || process.env.LLM_API_KEY || DEFAULT_OLLAMA_API_KEY,
      baseURL,
      primaryModel,
      fallbackModel,
    });
  }
}

module.exports = { OllamaVisionProvider };
