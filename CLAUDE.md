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
