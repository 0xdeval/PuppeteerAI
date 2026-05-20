---
name: puppeteer-ai-setup
description: Use when Claude needs to install, configure, or verify PuppeteerAI from this repository using local npm setup. This skill is intentionally npm-only: it covers Node.js prerequisites, dependency installation, Playwright Chromium installation, .env configuration, tests, startup, and health verification. Do not use it for Docker, RunPod, detailed Dolphin setup, cookie import, posting, replying, scraping, or Hermes runtime orchestration.
---

# PuppeteerAI Local npm Setup

Use this skill to install and verify PuppeteerAI from the repository checkout. Keep the flow local and npm-based.

## What This Sets Up

PuppeteerAI is a Node.js 20+ Express service for AI-guided browser automation on X and Facebook. It uses Playwright by default, can optionally connect to Dolphin Anty profiles, and exposes REST endpoints for profile management, posting, replying, scraping, debug artifacts, and health checks.

This skill installs the service and proves it can start. Runtime API usage lives in `README.md`, `API_REFERENCES.md`, `CLAUDE.md`, and the other root agent guide files.

## Prerequisites

Check:

```bash
node --version
npm --version
```

Requirements:

- Node.js `20.0.0` or newer.
- npm available on `PATH`.
- One LLM provider for real browser automation:
  - Anthropic, OpenAI-compatible provider, OpenRouter through OpenAI-compatible config, or local Ollama.

## Install

Run from the repository root:

```bash
npm install
npx playwright install chromium
```

## Configure Environment

If `.env` is missing, create it from the example:

```bash
cp .env.example .env
```

Set these values before running real automation:

```bash
API_SECRET=<long-random-secret>
LLM_PROVIDER=anthropic
LLM_API_KEY=<provider-api-key>
PORT=3001
DATA_DIR=./data
```

Provider notes:

- For `LLM_PROVIDER=ollama`, `LLM_API_KEY` is not required.
- For OpenAI-compatible local or proxy providers, set `LLM_BASE_URL`, `LLM_MODEL_PRIMARY`, and `LLM_MODEL_FALLBACK`.
- Keep `DATA_DIR` local to the checkout for local development, such as `./data`.

Sensitive data rules:

- Do not commit `.env`.
- Do not commit real cookies, proxies, profile data, screenshots, tokens, or API keys.

## Verify

Run tests:

```bash
npm test
```

Start the service:

```bash
npm start
```

In another shell, check health:

```bash
curl http://localhost:3001/health
```

Expected: JSON response from the health endpoint.

## Stop Condition

Setup is complete when:

- Dependencies are installed.
- Playwright Chromium is installed.
- `.env` exists with local development values.
- `npm test` passes.
- `npm start` launches the Express service.
- `GET /health` returns a JSON response.

## Out of Scope

This skill does not cover:

- Docker or RunPod setup.
- Detailed Dolphin Anty configuration.
- Cookie import.
- Posting, replying, or scraping workflows.
- Future Hermes orchestration.

A future Hermes skill can use this setup flow as its installation base before calling PuppeteerAI through the REST API.
