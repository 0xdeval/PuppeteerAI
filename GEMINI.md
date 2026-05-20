# PuppeteerAI Guide for Gemini

## Purpose

PuppeteerAI is a local or hosted browser automation service for X and Facebook. It exposes an authenticated REST API and uses AI vision models to operate a browser with persistent avatar-specific sessions.

## Architecture Overview

Request flow:

```text
client or orchestration system -> Express API -> profile registry -> Playwright or Dolphin -> X/Facebook
```

Important paths:

- `server.js`: starts the process.
- `src/app.js`: builds the Express app.
- `src/http/`: routes, handlers, and middleware.
- `src/services/`: profile and automation orchestration.
- `src/tasks/`: platform actions.
- `src/ai/`: prompts, vision, and provider adapters.
- `test/`: Node test runner tests.

## Commands

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm test
npm start
curl http://localhost:3001/health
```

## Environment

Minimum local values:

- `API_SECRET`: required for protected endpoints.
- `LLM_PROVIDER`: `anthropic`, `openai`, or `ollama`.
- `LLM_API_KEY`: required unless using Ollama.
- `PORT`: defaults to `3001`.
- `DATA_DIR`: local profile/debug storage directory.

## Common Tasks

- For setup, use `.codex/skills/puppeteer-ai-setup/SKILL.md`.
- For endpoint examples, read `API_REFERENCES.md`.
- For product workflow context, read `README.md`.
- For changed code, run `npm test`.

## Operational Cautions

- Do not include secrets or real account data in files.
- Do not use real posting as a test strategy.
- Treat cookies, proxy URLs, profile directories, and debug screenshots as sensitive data.
- Preserve the separation between HTTP handlers, services, platform tasks, and AI providers.
