---
name: puppeteer-ai
description: "Use when Hermes needs to install PuppeteerAI or operate its REST API for X/Facebook posting, replies, comments, profile cookies, scraping, or service health checks."
version: 1.0.2
author: 0xdeval
metadata:
  hermes:
    tags: [puppeteer, playwright, browser-automation, social-media, x, facebook]
    category: automation
    requires_toolsets: [terminal]
    config:
      - key: puppeteer_ai.base_url
        description: Base URL for the PuppeteerAI HTTP service
        default: "http://localhost:3001"
        prompt: PuppeteerAI service base URL
      - key: puppeteer_ai.project_dir
        description: Local checkout path for PuppeteerAI
        default: "~/PuppeteerAI"
        prompt: PuppeteerAI project directory
---

# PuppeteerAI for Hermes

Use this skill to install PuppeteerAI, verify the service, and call its REST API from Hermes. Keep all account cookies, proxies, API keys, and post drafts private unless the user explicitly asks to display them.

## Operating Rules

- Base URL comes from `puppeteer_ai.base_url`, defaulting to `http://localhost:3001`.
- Hermes local setup uses `DISABLE_API_AUTH=true` by default so API calls do not need auth headers.
- Never paste real cookies, proxy credentials, provider keys, or exported cookie files into chat.
- Do not claim a post/comment/reply was published unless the API returns success.
- If a profile needs login, ask the user to import fresh cookies before retrying.
- Supported platforms are exactly `x` and `facebook`.
- Profile IDs must be `x-{avatar}` or `facebook-{avatar}`.

## Install or Verify Service

Use the configured `puppeteer_ai.project_dir` or `~/PuppeteerAI` when no configured value is available.

Canonical source identity: `0xdeval/PuppeteerAI`. This is the only correct repository for the service. Never use `puppeteer/puppeteer`; that is a different browser automation library and will not contain this service's `server.js` or `src/app.js`.

1. Check tools:

```bash
node --version
npm --version
```

Node.js must be `20.0.0` or newer.

2. Create or enter the checkout.

Use an existing PuppeteerAI checkout when available. If no checkout exists, use the same trusted tap repository that provided this skill as the source and place the checkout in the configured project directory. If a terminal tool needs an owner/repo identifier, use exactly `0xdeval/PuppeteerAI`. Do not ask the user to confirm the source during a normal tap-installed setup. Ask only if the tap source is unavailable and no local checkout exists. Do not overwrite an existing directory.

After entering the checkout, verify:

```bash
test -f package.json
test -f server.js
test -f src/app.js
```

3. Install dependencies:

```bash
npm install
npx playwright install chromium
```

4. Configure `.env` if missing:

```bash
cp .env.example .env
```

Set at least:

```bash
DISABLE_API_AUTH=true
LLM_PROVIDER=anthropic
LLM_API_KEY=<provider-api-key>
PORT=3001
DATA_DIR=./data
```

For Hermes on a trusted local machine, leave API auth disabled. For a remote or shared service, do not use this skill's auth-free default; use the normal project documentation and enable HTTP API auth before exposing the service.

For Ollama, `LLM_API_KEY` is not required. For OpenRouter or another OpenAI-compatible provider, set `LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_MODEL_PRIMARY`, and `LLM_MODEL_FALLBACK`.

5. Verify:

```bash
npm test
npm start
```

In another shell:

```bash
curl http://localhost:3001/health
```

Setup is complete only when tests pass, the service starts, and `/health` returns JSON.

## Service Check

Before any API action:

```bash
export PUPPETEER_AI_BASE_URL="${PUPPETEER_AI_BASE_URL:-http://localhost:3001}"
curl "$PUPPETEER_AI_BASE_URL/health"
```

If `PUPPETEER_AI_BASE_URL` is not set, use the configured base URL or `http://localhost:3001`.

Check the local profile API without auth headers:

```bash
curl "$PUPPETEER_AI_BASE_URL/profiles"
```

## Prepare a Profile

Import cookies once per avatar and platform. The user should provide a local cookie export file path, not paste cookie contents into chat.

Use the canonical profile ID:

```text
x-alice
facebook-alice
```

Import from a local JSON cookie file:

```bash
curl -X POST "$PUPPETEER_AI_BASE_URL/profiles/x-alice/cookies" \
  -H "Content-Type: application/json" \
  -d @cookies-payload.json
```

`cookies-payload.json` shape:

```json
{
  "cookies": [],
  "proxy": "http://username:password@host:port",
  "dolphin_profile_id": "optional-dolphin-profile-id"
}
```

The `proxy` and `dolphin_profile_id` fields are optional. Use the same proxy that was active when the account logged in.

Check profile cookie status:

```bash
curl "$PUPPETEER_AI_BASE_URL/profiles/x-alice/cookies"
```

## Publish a Post

Use this for X posts and Facebook personal posts.

```bash
curl -X POST "$PUPPETEER_AI_BASE_URL/post" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "alice",
    "platform": "x",
    "text": "Post text"
  }'
```

Optional image:

```json
{
  "avatar": "alice",
  "platform": "facebook",
  "text": "Post text",
  "image_url": "<optional-image-url>"
}
```

Success response includes `success: true`, `profileId`, and sometimes `post_url`.

## Reply or Comment

Use `/reply` for X replies and Facebook comments.

```bash
curl -X POST "$PUPPETEER_AI_BASE_URL/reply" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "alice",
    "platform": "x",
    "post_url": "<target-post-url>",
    "text": "Reply text"
  }'
```

For Facebook, set `platform` to `facebook` and pass the Facebook post URL.

## Scrape Facebook Posts

Scraping is currently for Facebook profile/page URLs.

```bash
curl -X POST "$PUPPETEER_AI_BASE_URL/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "alice",
    "platform": "facebook",
    "profile_url": "<facebook-profile-or-page-url>",
    "limit": 5
  }'
```

Success response includes `success: true`, `profileId`, and `posts`.

## Error Handling

- `401`: The service has HTTP API auth enabled. For Hermes local mode, set `DISABLE_API_AUTH=true` and restart. For remote/shared services, stop and ask the user how to authenticate.
- `400`: Missing fields, invalid platform, invalid profile ID, invalid cookie payload, or failed image download.
- `429`: Profile is rate-limited or browser is busy. Wait before retrying.
- `504`: Browser automation timed out. Retry once after checking service logs.
- `needs_login`, `login_required`, or `login_expired`: ask the user for fresh cookies for the matching profile.
- Unknown `500`: report the generic failure and inspect server logs; do not expose secrets from logs.

## Completion Criteria

For install requests, stop when the repository exists, dependencies and Chromium are installed, `.env` is configured, tests pass, service starts, and `/health` responds.

For action requests, stop when the API response is returned to the user with the relevant `profileId`, status, and `post_url` or scraped `posts` when present.
