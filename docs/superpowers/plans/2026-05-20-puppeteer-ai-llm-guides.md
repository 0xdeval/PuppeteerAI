# PuppeteerAI LLM Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-local npm setup skill and agent-specific project guide files for Codex, Claude, and Gemini.

**Architecture:** Keep the install procedure in `.codex/skills/puppeteer-ai-setup/SKILL.md` so future agents can invoke it directly. Keep broader product, structure, usage, and development guidance in root-level agent files, with each file tuned to the target agent rather than copied verbatim.

**Tech Stack:** Markdown, Codex skill frontmatter, Node.js 20+, npm, Playwright Chromium, Express service verification through `npm test` and `GET /health`.

---

## File Structure

- Create `.codex/skills/puppeteer-ai-setup/SKILL.md`
  - Repo-local Codex skill for npm-only installation and health verification.
- Create `AGENTS.md`
  - Codex operating guide for this repository.
- Create `CLAUDE.md`
  - Claude-oriented concise project guide.
- Create `GEMINI.md`
  - Gemini-oriented explicit project guide.
- Reference existing files without modifying them:
  - `README.md`
  - `API_REFERENCES.md`
  - `.env.example`
  - `package.json`
  - `server.js`
  - `src/app.js`

---

### Task 1: Add Repo-Local PuppeteerAI Setup Skill

**Files:**
- Create: `.codex/skills/puppeteer-ai-setup/SKILL.md`

- [ ] **Step 1: Create the skill directory**

Run:

```bash
mkdir -p .codex/skills/puppeteer-ai-setup
```

Expected: command exits with status `0`.

- [ ] **Step 2: Add the setup skill**

Create `.codex/skills/puppeteer-ai-setup/SKILL.md` with this structure and content:

```markdown
---
name: puppeteer-ai-setup
description: Use when an agent needs to install, configure, or verify PuppeteerAI from this repository using local npm setup. This skill is intentionally npm-only: it covers Node.js prerequisites, dependency installation, Playwright Chromium installation, .env configuration, tests, startup, and health verification. Do not use it for Docker, RunPod, detailed Dolphin setup, cookie import, posting, replying, scraping, or Hermes runtime orchestration.
---

# PuppeteerAI Local npm Setup

Use this skill to install and verify PuppeteerAI from the repository checkout. Keep the flow local and npm-based.

## What This Sets Up

PuppeteerAI is a Node.js 20+ Express service for AI-guided browser automation on X and Facebook. It uses Playwright by default, can optionally connect to Dolphin Anty profiles, and exposes REST endpoints for profile management, posting, replying, scraping, debug artifacts, and health checks.

This skill installs the service and proves it can start. Runtime API usage lives in `README.md`, `API_REFERENCES.md`, and the root agent guide files.

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
```

- [ ] **Step 3: Check skill trigger metadata**

Run:

```bash
sed -n '1,40p' .codex/skills/puppeteer-ai-setup/SKILL.md
```

Expected:

- Frontmatter includes `name: puppeteer-ai-setup`.
- Frontmatter description says npm-only setup.
- Body starts with `# PuppeteerAI Local npm Setup`.

- [ ] **Step 4: Commit Task 1**

Run:

```bash
git add .codex/skills/puppeteer-ai-setup/SKILL.md
git commit -m "Make PuppeteerAI installable by repo-local agents" -m "Add the npm-only setup skill so future agents can install and verify the service without loading broader product documentation." -m "Constraint: Skill must stay repo-local under .codex/skills and avoid Hermes runtime behavior
Rejected: Runtime API workflow in the setup skill | setup and usage have different trigger contexts
Confidence: high
Scope-risk: narrow
Directive: Keep Docker, RunPod, cookie import, and publishing workflows outside this setup skill
Tested: sed -n '1,40p' .codex/skills/puppeteer-ai-setup/SKILL.md
Not-tested: Full npm install flow not rerun during markdown creation
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

Expected: commit succeeds.

---

### Task 2: Add Codex Repository Guide

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create `AGENTS.md`**

Create `AGENTS.md` with these sections:

```markdown
# PuppeteerAI Agent Guide

## Product

PuppeteerAI is a Node.js 20+ Express service for AI-guided browser automation on X and Facebook. It launches a browser per request, uses persistent per-avatar profile data, and exposes REST endpoints for posting, replying, scraping, profile management, debug artifacts, and health checks.

Primary workflows:

- Post to X.
- Reply on X.
- Post to Facebook.
- Comment on Facebook posts.
- Scrape visible Facebook posts from a profile or page.

## Local Setup

Use the repo-local Codex skill `.codex/skills/puppeteer-ai-setup/SKILL.md` for npm-only setup.

Core commands:

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm test
npm start
curl http://localhost:3001/health
```

## Repository Map

- `server.js` loads environment variables, creates the app, runs startup cleanup, and listens on `PORT`.
- `src/app.js` composes Express middleware, auth, services, routes, and error handling.
- `src/http/routes/*` registers route paths only.
- `src/http/handlers/*` maps HTTP requests to service calls and HTTP responses.
- `src/http/middleware/*` contains auth and timeout middleware.
- `src/services/automation-service.js` owns shared automation execution, readiness checks, rate limits, and result mapping.
- `src/services/profile-service.js` owns profile registry and cookie/profile helpers.
- `src/tasks/*` contains platform-specific browser automation tasks.
- `src/ai/*` contains provider adapters, prompts, and vision logic.
- `src/browser.js` and `src/dolphin.js` contain browser backend internals.
- `test/*` contains Node test runner coverage for services and HTTP contracts.

## Coding Rules

- Preserve REST API compatibility unless the user explicitly asks for an API change.
- Keep route files thin.
- Keep handlers focused on request parsing and response mapping.
- Keep services free of Express `req` and `res` objects.
- Put platform browser behavior in `src/tasks/*`.
- Put provider-specific LLM behavior in `src/ai/providers/*`.
- Prefer focused tests around changed behavior.
- Do not add new dependencies unless the task clearly requires them.

## Safety

- Never commit `.env`, API keys, real cookies, proxies, profile data, debug screenshots, or account identifiers.
- Do not run tests that post to real social accounts.
- Treat browser profile directories and saved debug artifacts as sensitive.
- Use mocked services for HTTP and service tests when possible.

## Useful References

- `README.md` explains setup, product scope, and normal workflows.
- `API_REFERENCES.md` contains endpoint examples and cookie import details.
- `.env.example` lists supported environment variables.
- `package.json` lists scripts and runtime dependencies.
```

- [ ] **Step 2: Check `AGENTS.md` content**

Run:

```bash
rg -n "Product|Local Setup|Repository Map|Coding Rules|Safety|Useful References" AGENTS.md
```

Expected: all six section names are found.

- [ ] **Step 3: Commit Task 2**

Run:

```bash
git add AGENTS.md
git commit -m "Give Codex agents a product-aware repo guide" -m "Add the root AGENTS.md so Codex can understand the service boundaries, setup commands, and safety rules before editing." -m "Constraint: Guide must describe current repo structure without replacing README or API_REFERENCES
Rejected: Generic copied LLM guide | Codex needs explicit coding and verification rules
Confidence: high
Scope-risk: narrow
Directive: Keep AGENTS.md aligned when route, service, task, or AI boundaries change
Tested: rg -n \"Product|Local Setup|Repository Map|Coding Rules|Safety|Useful References\" AGENTS.md
Not-tested: No runtime behavior changed
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

Expected: commit succeeds.

---

### Task 3: Add Claude Repository Guide

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create `CLAUDE.md`**

Create `CLAUDE.md` with these sections:

```markdown
# PuppeteerAI Guide for Claude

## What This Project Is

PuppeteerAI is an Express API that uses AI-guided browser automation to post, reply, comment, and scrape on X and Facebook. It keeps separate persistent profile data for each avatar and platform, then launches a browser per request.

## Fast Local Setup

Use npm setup only for local development:

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm test
npm start
```

Then verify:

```bash
curl http://localhost:3001/health
```

Set `API_SECRET`, `LLM_PROVIDER`, provider credentials, `PORT`, and local `DATA_DIR` in `.env`.

## Key Boundaries

- `server.js`: process entrypoint.
- `src/app.js`: Express app composition.
- `src/http/routes/*`: route registration.
- `src/http/handlers/*`: HTTP request and response mapping.
- `src/services/*`: profile and automation workflows.
- `src/tasks/*`: X and Facebook browser actions.
- `src/ai/*`: prompts, vision loop, and provider adapters.

## Working Rules

- Keep API behavior stable unless the requested task changes it.
- Keep handlers small and move shared workflow behavior into services.
- Keep tests local and deterministic.
- Use `npm test` for repository verification.
- Use `README.md` for product setup context and `API_REFERENCES.md` for endpoint examples.

## Safety

Do not commit secrets, cookies, proxies, screenshots, profile directories, or real account data. Do not trigger real social posting as part of tests or verification.
```

- [ ] **Step 2: Check `CLAUDE.md` content**

Run:

```bash
rg -n "What This Project Is|Fast Local Setup|Key Boundaries|Working Rules|Safety" CLAUDE.md
```

Expected: all five section names are found.

- [ ] **Step 3: Commit Task 3**

Run:

```bash
git add CLAUDE.md
git commit -m "Give Claude a concise PuppeteerAI briefing" -m "Add a Claude-specific guide focused on project purpose, setup, boundaries, and safe editing rules." -m "Constraint: Claude guide should stay concise while still pointing to source docs
Rejected: Duplicating the full Codex guide | Claude needs a shorter briefing surface
Confidence: high
Scope-risk: narrow
Directive: Keep this guide practical and avoid expanding it into a full API reference
Tested: rg -n \"What This Project Is|Fast Local Setup|Key Boundaries|Working Rules|Safety\" CLAUDE.md
Not-tested: No runtime behavior changed
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

Expected: commit succeeds.

---

### Task 4: Add Gemini Repository Guide

**Files:**
- Create: `GEMINI.md`

- [ ] **Step 1: Create `GEMINI.md`**

Create `GEMINI.md` with these sections:

```markdown
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
```

- [ ] **Step 2: Check `GEMINI.md` content**

Run:

```bash
rg -n "Purpose|Architecture Overview|Commands|Environment|Common Tasks|Operational Cautions" GEMINI.md
```

Expected: all six section names are found.

- [ ] **Step 3: Commit Task 4**

Run:

```bash
git add GEMINI.md
git commit -m "Give Gemini an explicit PuppeteerAI map" -m "Add a Gemini-specific guide with the service flow, command reference, environment summary, and operational cautions." -m "Constraint: Gemini guide should be explicit about structure and command sequence
Rejected: Reusing CLAUDE.md verbatim | Gemini benefits from a more structured map
Confidence: high
Scope-risk: narrow
Directive: Keep command and environment summaries synchronized with package.json and .env.example
Tested: rg -n \"Purpose|Architecture Overview|Commands|Environment|Common Tasks|Operational Cautions\" GEMINI.md
Not-tested: No runtime behavior changed
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

Expected: commit succeeds.

---

### Task 5: Verify Package and Documentation

**Files:**
- Verify: `.codex/skills/puppeteer-ai-setup/SKILL.md`
- Verify: `AGENTS.md`
- Verify: `CLAUDE.md`
- Verify: `GEMINI.md`

- [ ] **Step 1: Confirm branch**

Run:

```bash
git branch --show-current
```

Expected:

```text
llm-project-guides
```

- [ ] **Step 2: Confirm deliverable files exist**

Run:

```bash
test -f .codex/skills/puppeteer-ai-setup/SKILL.md
test -f AGENTS.md
test -f CLAUDE.md
test -f GEMINI.md
```

Expected: each command exits with status `0`.

- [ ] **Step 3: Scan for unsafe placeholders and secret-like examples**

Run:

```bash
rg -n "T(BD|ODO)|sk-[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{16}|auth_token.*[A-Za-z0-9]{20,}|ct0.*[A-Za-z0-9]{20,}" .codex/skills/puppeteer-ai-setup/SKILL.md AGENTS.md CLAUDE.md GEMINI.md
```

Expected: no matches.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: Node test runner exits with status `0`.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

- Working tree is clean after task commits.
- Recent commits include the design spec and four implementation commits.

- [ ] **Step 6: Report completion**

Report:

- Branch name.
- Files added.
- Test command and result.
- Any verification gaps.

No final commit is needed in this task if Tasks 1-4 were committed separately.

---

## Plan Self-Review

Spec coverage:

- Repo-local setup skill: covered by Task 1.
- `AGENTS.md`: covered by Task 2.
- `CLAUDE.md`: covered by Task 3.
- `GEMINI.md`: covered by Task 4.
- npm-only setup scope: covered by Task 1.
- Agent-specific guide files: covered by Tasks 2-4.
- Verification with `npm test` and content checks: covered by Task 5.
- Separate branch: covered by Task 5 branch check.

Placeholder scan:

- The plan uses concrete file paths, commands, content, expected results, and commit messages.
- The plan contains no placeholder instructions for implementation workers.

Scope check:

- The plan does not add Docker, RunPod, cookie import, posting, replying, scraping, or Hermes runtime behavior.
