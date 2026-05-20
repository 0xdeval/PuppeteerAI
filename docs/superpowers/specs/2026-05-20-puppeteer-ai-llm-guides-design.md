# PuppeteerAI Setup Skill and LLM Guide Files Design

Date: 2026-05-20
Status: Approved in conversation
Branch: `llm-project-guides`

## 1. Goal

Create a repo-local onboarding surface that helps LLM agents understand, install, and work with PuppeteerAI safely.

The deliverables are:

1. `.codex/skills/puppeteer-ai-setup/SKILL.md`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `GEMINI.md`

The Codex skill focuses on npm-based installation only. The root guide files explain the product, project structure, commands, safe usage boundaries, and common development workflows in an agent-specific way.

## 2. Product Context

PuppeteerAI is a Node.js 20+ Express service for AI-guided browser automation on X and Facebook. It uses Playwright or optional Dolphin Anty profiles, supports multiple LLM providers, stores persistent per-avatar profile data, and exposes REST endpoints for posting, replying, scraping, profile management, debugging, and health checks.

Primary workflows:

1. Post to X.
2. Reply on X.
3. Post to Facebook.
4. Comment on Facebook.
5. Scrape visible Facebook posts from a profile or page.

## 3. Chosen Approach

Use a narrow repo-local setup skill plus richer agent guide files.

### Why this approach

The future Hermes integration needs a reliable base procedure for installing PuppeteerAI. A narrow setup skill is easier for another agent to invoke and follow than a broad product manual. Broader runtime and development context belongs in root guide files where coding agents naturally look before making changes.

### Rejected alternatives

1. A single large setup-and-usage skill.
   - Rejected because it would mix installation with runtime API behavior and make the skill noisier for Hermes to reuse.
2. Separate setup and API-usage skills immediately.
   - Rejected because the runtime skill should be shaped by the later Hermes integration requirements instead of guessed now.

## 4. Setup Skill Design

Path:

`.codex/skills/puppeteer-ai-setup/SKILL.md`

Skill name:

`puppeteer-ai-setup`

Trigger intent:

Use when an agent needs to install, configure, or verify PuppeteerAI from this repository using npm.

Scope:

1. Local npm setup only.
2. Node.js 20+ and npm prerequisites.
3. Dependency installation with `npm install`.
4. Chromium browser installation with `npx playwright install chromium`.
5. `.env` creation from `.env.example` when missing.
6. Required environment setup:
   - `API_SECRET`
   - `LLM_PROVIDER`
   - `LLM_API_KEY` unless using Ollama
   - `LLM_BASE_URL` and model names when using OpenAI-compatible local providers
   - `PORT`
   - local `DATA_DIR`
7. Verification:
   - `npm test`
   - `npm start`
   - `GET /health`

Out of scope:

1. Docker setup.
2. RunPod setup.
3. Detailed Dolphin Anty setup.
4. Cookie import workflows.
5. Posting, replying, or scraping workflows.
6. Hermes-specific orchestration.

The skill may mention that a future Hermes skill can follow this setup flow before using PuppeteerAI, but it must not define Hermes behavior.

## 5. Root Agent Guide Design

### `AGENTS.md`

Purpose:

Codex-oriented operating guide for this repository.

Expected content:

1. Product summary.
2. Repository structure map.
3. Local setup commands.
4. Test and run commands.
5. Architecture boundaries:
   - `server.js` starts the app.
   - `src/app.js` composes Express middleware and routes.
   - `src/http/routes/*` registers routes.
   - `src/http/handlers/*` maps HTTP requests to services.
   - `src/services/*` owns profile and automation workflows.
   - `src/tasks/*` owns platform-specific browser actions.
   - `src/ai/*` owns provider and vision logic.
6. Coding rules:
   - Preserve API compatibility unless explicitly changing it.
   - Keep handlers thin.
   - Keep services free of Express response construction.
   - Prefer focused tests around changed behavior.
7. Safety rules:
   - Do not include real secrets.
   - Do not perform real social posting from tests.
   - Treat cookies, proxies, screenshots, and profile data as sensitive.
8. Pointers to `README.md` and `API_REFERENCES.md`.

### `CLAUDE.md`

Purpose:

Claude-oriented project briefing with concise context and practical guardrails.

Expected content:

1. What PuppeteerAI does.
2. How to set it up locally with npm.
3. How to run tests and start the service.
4. Key files and boundaries.
5. Safe usage and editing cautions.
6. Where to find API examples.

### `GEMINI.md`

Purpose:

Gemini-oriented project briefing with explicit structure, command list, and operational cautions.

Expected content:

1. Product purpose.
2. Architecture overview.
3. Command reference.
4. Environment variables overview.
5. Common tasks.
6. Automation safety constraints.

## 6. Validation

Implementation is complete when:

1. The current branch is `llm-project-guides`.
2. The four deliverable files exist.
3. The skill is narrow, npm-only, and usable without loading the full repository documentation.
4. The guide files are agent-specific instead of identical copies.
5. The guide files accurately describe the current repository structure.
6. No secrets, tokens, real cookies, or real account credentials are introduced.
7. `npm test` passes.
8. A lightweight content check confirms the expected files and headings exist.

## 7. Implementation Plan Shape

After this design is reviewed, create a short implementation plan that:

1. Adds the repo-local setup skill.
2. Adds `AGENTS.md`.
3. Adds `CLAUDE.md`.
4. Adds `GEMINI.md`.
5. Runs verification.
6. Commits the implementation using the repository Lore commit format.

## 8. Risks and Mitigations

1. Risk: The setup skill grows into a product manual.
   - Mitigation: Keep runtime API usage in root guide files and existing docs.
2. Risk: Guide files drift from the codebase.
   - Mitigation: Base structure and commands on current files and `package.json`.
3. Risk: Agent docs encourage unsafe real-account automation.
   - Mitigation: Explicitly prohibit tests or examples that post with real accounts or expose secrets.
4. Risk: Future Hermes assumptions leak into this repo.
   - Mitigation: Mention Hermes only as a future consumer of the setup contract, not as a current implementation target.
