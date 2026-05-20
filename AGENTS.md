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
