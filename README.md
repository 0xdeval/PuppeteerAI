# Avatar Browser Service

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)
![Tests](https://img.shields.io/badge/tests-node%20--test-2ea44f.svg)
![Platforms](https://img.shields.io/badge/platforms-X%20%2B%20Facebook-111827.svg)
![Automation](https://img.shields.io/badge/automation-Playwright%20%2B%20Dolphin-fbca04.svg)

AI-guided browser automation for posting and replying on X and Facebook with persistent per-avatar browser profiles.

## Demo

![Avatar Browser Service demo](./docs/demo.gif)

## What This Solves

- Post personal updates on X using AI-guided browser actions.
- Reply to X posts using AI-guided browser actions.
- Post personal updates on Facebook.
- Comment on Facebook posts.
- Parse visible posts from a Facebook profile or page.

## How It Works

```text
client / n8n -> REST API -> profile registry -> Playwright or Dolphin -> X/Facebook
```

- No browser stays open permanently. A browser launches per request, does the job, and closes.
- AI vision (Anthropic / OpenAI / Ollama / OpenRouter) drives browser actions.
- Each avatar + platform pair has its own persistent cookie/profile directory.

## Quickstart

### Prerequisites

- Node.js 20+
- npm
- One supported LLM provider (Anthropic/OpenAI/OpenRouter) or local Ollama

### 1) Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2) Configure environment

```bash
cp .env.example .env
```

Set at least:

```bash
API_SECRET=change-me-to-a-strong-random-secret
LLM_PROVIDER=anthropic
LLM_API_KEY=your-anthropic-or-openai-api-key-here
DATA_DIR=/absolute/path/to/puppeteer/data
```

For OpenRouter:

```bash
LLM_PROVIDER=openai
LLM_API_KEY=your-openrouter-api-key-here
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL_PRIMARY=anthropic/claude-sonnet-4
LLM_MODEL_FALLBACK=anthropic/claude-sonnet-4
```

For Ollama:

```bash
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL_PRIMARY=qwen2.5vl:7b
LLM_MODEL_FALLBACK=qwen2.5vl:7b
```

### 3) Start the service

```bash
npm start
```

API runs on `http://localhost:3001` by default.

### 4) One-time profile setup per avatar+platform

Import cookies once for each profile (`x-alice`, `facebook-bob`, etc.):

```bash
curl -X POST http://localhost:3001/profiles/x-alice/cookies \
  -H "x-api-key: change-me-to-a-strong-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [
      {
        "name": "session-cookie-name",
        "value": "session-cookie-value",
        "domain": ".x.com",
        "path": "/"
      }
    ],
    "proxy": "http://username:password@host:port"
  }'
```

The `proxy` field is optional but recommended for account stability.

### 5) Use the five supported workflows

- Post to X: `POST /post` with `platform: "x"`
- Reply on X: `POST /reply` with `platform: "x"`
- Post to Facebook: `POST /post` with `platform: "facebook"`
- Comment on Facebook: `POST /reply` with `platform: "facebook"`
- Parse visible Facebook posts: `POST /scrape` with `platform: "facebook"`

## Cookie Export and Session Import (Detailed)

New avatars need session import before automation can run reliably.

### Why cookie import is recommended

X and Facebook often challenge scripted login flows. The stable path is:

1. Log in manually in normal Chrome.
2. Export cookies.
3. Import cookies into this service.

### IP consistency guidance

Platforms track session origin. If login and automation come from different IPs, accounts can be challenged.
Use the same residential proxy for login and automation when possible.

### Export/import steps

1. Install [Cookie-Editor](https://cookie-editor.com) or export from browser devtools.
2. Log in normally to the target account.
3. Export cookies as JSON.
4. Import with `POST /profiles/:id/cookies`.

Cookie fields needed per platform are documented in [API_REFERENCES.md](./API_REFERENCES.md).

## Typical Workflow

```text
1. Start service       -> npm start (local) or docker compose up (VPS)
2. Add avatar          -> manual login in normal browser
3. Import cookies      -> POST /profiles/:id/cookies
4. Check readiness     -> GET /profiles
5. Post or reply       -> POST /post or POST /reply
6. Session expires     -> re-export and re-import cookies
7. Retire avatar       -> DELETE /profiles/:id
```

## Dolphin Anty Integration

[Dolphin Anty](https://dolphin-anty.com) provides anti-detect browser fingerprints.
If a profile has `dolphinProfileId`, the service connects to Dolphin via CDP instead of launching plain Playwright.

### When to use it

Use Dolphin only when plain Playwright sessions are repeatedly flagged.
If no Dolphin profile is configured, built-in Playwright is used automatically.

### Prerequisites

- Dolphin Anty app installed and running
- Active Dolphin account
- API token from `https://dolphin-anty.com/panel`

### Environment variables

```bash
DOLPHIN_API_URL=http://localhost:3001
DOLPHIN_API_TOKEN=your-dolphin-api-token-here
```

### Profile management

Dolphin profile creation is done in the Dolphin desktop app.
Assign one Dolphin profile per avatar to avoid fingerprint reuse.

Attach `dolphinProfileId` in `data/registry.json`:

```json
{
  "profiles": {
    "x-alice": {
      "id": "x-alice",
      "platform": "x",
      "avatar": "alice",
      "dolphinProfileId": "123456",
      "status": "needs_login"
    }
  }
}
```

## API Reference

All endpoints and payloads are documented in [API_REFERENCES.md](./API_REFERENCES.md).

## Other Launching Options

### Running with Docker

```bash
cp .env.example .env
# Edit .env (keep DATA_DIR=/app/data in Docker)
docker compose up --build
```

Stop:

```bash
docker compose down
```

Data is stored in Docker volume-backed `/app/data` and survives restarts.

### Deploying to RunPod (one click deployment)

Use `Dockerfile.runpod` for GPU deployments with local Ollama models.

Build and push:

```bash
docker build --platform linux/amd64 -f Dockerfile.runpod -t yourdockerhubuser/avatar-worker:latest .
docker login
docker push yourdockerhubuser/avatar-worker:latest
```

RunPod request body example:

```json
{
  "cloudType": "COMMUNITY",
  "gpuCount": 1,
  "gpuTypeIds": [
    "NVIDIA GeForce RTX 3090",
    "NVIDIA GeForce RTX 4090",
    "NVIDIA GeForce RTX 3090 Ti",
    "NVIDIA RTX A5000",
    "NVIDIA RTX A6000"
  ],
  "imageName": "yourdockerhubuser/avatar-worker:latest",
  "dataCenterIds": [
    "EU-RO-1",
    "EU-SE-1",
    "EUR-IS-1",
    "EU-CZ-1",
    "EUR-IS-2",
    "EUR-IS-3",
    "EUR-NO-1",
    "EU-FR-1"
  ],
  "containerDiskInGb": 30,
  "volumeInGb": 0,
  "ports": ["3001/http", "11434/http"],
  "name": "Avatar-Worker-REST",
  "env": {
    "SSH_PRIVATE_KEY": "{{ $vars.GithubAuthToken}}",
    "API_SECRET": "change-me-to-a-strong-random-secret",
    "LLM_PROVIDER": "ollama",
    "LLM_BASE_URL": "http://localhost:11434/v1",
    "LLM_MODEL_PRIMARY": "qwen3-vl:8b",
    "LLM_MODEL_FALLBACK": "qwen3-vl:8b",
    "PORT": "3001",
    "DATA_DIR": "/app/data"
  },
  "dockerStartCmd": ["/entrypoint.sh"]
}
```

Runtime startup (`runpod-entrypoint.sh`):

1. Writes SSH key from `SSH_PRIVATE_KEY`
2. Clones repo into `/app`
3. Writes `/app/.env` from env vars
4. Starts Xvfb
5. Starts Ollama
6. Starts API with `npm run start`

## Platform Notes

- Valid platform values: `x` and `facebook`
- Keep profile IDs aligned: `x-{avatar}` and `facebook-{avatar}`
- Facebook posting uses top-feed composer (not messenger/edit UI)
- Facebook `image_url` flow attaches media before typing text

## Rate Limits

Per avatar+platform:

| Limit | Default | Env var |
| --- | --- | --- |
| Minimum interval between posts | 60 seconds | `RATE_LIMIT_MIN_INTERVAL` |
| Maximum posts per day | 20 | `RATE_LIMIT_DAILY_MAX` |

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `API_SECRET` | Yes | — | API key for protected requests |
| `LLM_PROVIDER` | Yes | — | `anthropic`, `openai`, or `ollama` |
| `LLM_API_KEY` | Yes* | — | Cloud LLM API key. Optional when `LLM_PROVIDER=ollama` |
| `LLM_MODEL_PRIMARY` | No* | `claude-haiku-4-5-20251001` | Fast model. Required for `ollama` |
| `LLM_MODEL_FALLBACK` | No | `claude-sonnet-4-20250514` | Fallback model |
| `LLM_BASE_URL` | No* | — | Base URL. Required for `ollama` |
| `LLM_FALLBACK_PROVIDER` | No | same as primary | Optional fallback provider |
| `LLM_FALLBACK_API_KEY` | No | — | API key for fallback provider |
| `PORT` | No | `3001` | API port |
| `DATA_DIR` | No | repo-root `data/` | Persistent storage root. Docker examples use `/app/data` |
| `MAX_BROWSER_TIMEOUT` | No | `600` | Max browser runtime per request (seconds). `.env.example` recommends `120` |
| `MAX_AI_RETRIES` | No | `3` | AI retries per action |
| `RATE_LIMIT_MIN_INTERVAL` | No | `60` | Min seconds between posts |
| `RATE_LIMIT_DAILY_MAX` | No | `20` | Max daily posts per avatar |
| `DOLPHIN_API_URL` | No | `http://localhost:3001` | Dolphin local API URL |
| `DOLPHIN_API_TOKEN` | No | — | Dolphin API bearer token |
| `SAVE_DEBUG_SCREENSHOTS` | No | `true` | Save failure screenshots to `/data/debug/` |
| `NODE_ENV` | No | `production` | Runtime mode |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
