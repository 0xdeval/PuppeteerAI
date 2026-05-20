---
name: puppeteer-ai-setup
description: "Use when Claude needs to install, configure, or verify PuppeteerAI using local npm setup, whether from an existing checkout or by cloning https://github.com/0xdeval/PuppeteerAI.git into a target directory. This skill is intentionally npm-only: it covers Node.js prerequisites, repository checkout, dependency installation, Playwright Chromium installation, .env configuration, tests, startup, and health verification. Do not use it for Docker, RunPod, detailed Dolphin setup, cookie import, posting, replying, scraping, or Hermes runtime orchestration."
---

# PuppeteerAI Local npm Setup

Use this skill to install and verify PuppeteerAI. It works from an existing PuppeteerAI checkout or from any directory where the user wants the repository cloned. Keep the flow local and npm-based.

## What This Sets Up

PuppeteerAI is a Node.js 20+ Express service for AI-guided browser automation on X and Facebook. It uses Playwright by default, can optionally connect to Dolphin Anty profiles, and exposes REST endpoints for profile management, posting, replying, scraping, debug artifacts, and health checks.

This skill installs the service and proves it can start. Runtime API usage lives in `README.md`, `API_REFERENCES.md`, `CLAUDE.md`, and the other root agent guide files.

Future orchestration agents such as Hermes may use this skill for the install and verification phase, then call PuppeteerAI through its REST API. This skill does not define Hermes runtime behavior.

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

## Choose Target Directory

First determine where PuppeteerAI should live:

- If the current directory already contains `package.json`, `server.js`, and `src/app.js`, treat it as the PuppeteerAI checkout.
- If the user names a target directory, use that directory.
- If the user does not name a target directory, use `./PuppeteerAI`.

If the target directory does not exist, clone the repository:

```bash
git clone https://github.com/0xdeval/PuppeteerAI.git ./PuppeteerAI
cd ./PuppeteerAI
```

If the target directory exists, enter it and verify it is PuppeteerAI:

```bash
cd <target-directory>
test -f package.json
test -f server.js
test -f src/app.js
```

If those files are missing, stop and ask for a different target directory instead of installing into an unrelated project.

## Install Dependencies

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

- The PuppeteerAI repository exists in the target directory.
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
