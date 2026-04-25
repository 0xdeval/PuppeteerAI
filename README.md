# Puppeteer Service

A REST API that manages headless browser instances to post on social media (X/Twitter, Facebook) on behalf of multiple AI avatars. Each avatar has its own persistent browser profile so sessions survive between requests.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Get Started](#get-started)
  - [Running with AI providers](#running-with-ai-providers)
  - [First-Time Launch](#first-time-launch)
  - [Typical Workflow](#typical-workflow)
- [Dolphin Anty Integration](#dolphin-anty-integration)
- [API Reference](#api-reference)
- [Other Launching Options](#other-launching-options)
  - [Running with Docker](#running-with-docker)
  - [Deploying to RunPod](#deploying-to-runpod-one-click-deployment)
- [Platform Notes](#platform-notes)
- [Rate Limits](#rate-limits)
- [Environment Variables](#environment-variables)
- [License](#license)

---

## How It Works

```
n8n / your app  →  POST /post  →  Puppeteer Service  →  X / Facebook
                                          ↓
                               /data/profiles/{platform}-{avatar}/
                               (persistent cookies — avatar stays logged in)
```

- No browser stays open permanently. A browser launches per request, does the job, and closes.
- AI vision (Claude / OpenAI / Ollama / OpenRouter) drives all browser actions — no hardcoded selectors.
- Each avatar × platform pair has its own cookie profile stored on disk.

---

## Get started

### Running with AI providers

**Prerequisites:** Node.js 20+, an Anthropic/OpenAI/OpenRouter API key.

**1. Install dependencies**v

```bash
npm install
npx playwright install chromium
```

**2. Configure environment. Edit `.env` — minimum required fields**

```bash
cp .env.example .env
```

**For OpenAI/Anthropic:**

```bash
# For service auth
API_SECRET=any-secret-string

# Model settings
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-your-key-here
DATA_DIR=/Users/yourname/path/to/project/data   # absolute local path
```

**For OpenRouter:**

```bash
# For service auth
API_SECRET=any-secret-string

LLM_PROVIDER=openai
LLM_API_KEY=sk... # API key for the primary LLM provider
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL_PRIMARY=anthropic/claude-sonnet-4
LLM_MODEL_FALLBACK=anthropic/claude-sonnet-4
```

**For Ollama:**

```bash
# For service auth
API_SECRET=any-secret-string

LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434/v1 # if you running the model locally
LLM_MODEL_PRIMARY=qwen2.5vl:7b
LLM_MODEL_FALLBACK=qwen2.5vl:7b
```

**3. Start the server**

```bash
npm start
```

**4. Server listens on `http://localhost:3001`**

---

### First-Time launch

New avatars need a one-time session import before they can post automatically.

#### Cookie Import (avoids bot detection and additional login)

X and Facebook actively block login attempts from automated browsers. The reliable approach is to log in normally in your real Chrome, export the cookies, and import them into the service.

> **Important — IP consistency:** Platforms track the IP address associated with each session. If you log in from one IP and then automate from a different IP (e.g. your Mac vs. a RunPod server), the account may be temporarily blocked. To prevent this, use the **same residential proxy** for both login on your machine and automation on RunPod. See the proxy setup steps below.

**[Optional] Step 0 — Get a proxy.** You can get free or paid [Webshare](https://webshare.io) to avoid any blocks

**Step 1 — Install the [Cookie-Editor](https://cookie-editor.com) extension** in Chrome (with proxy active) OR export cookies using DevTool in your browser (DevTool -> Application -> Export necessary cookies)

**Step 2 — Log into X (or Facebook) normally** in that browser as the avatar account.

**Step 3 — Export the cookies:**

- Click the Cookie-Editor icon
- Click **Export → Export as JSON**
- This copies the cookies JSON to your clipboard

> Necessary cookies can be found in [API_REFERENCES section](https://github.com/0xdeval/puppeteer/blob/main/API_REFERENCES.md)

**Step 4 — Import into the service, including the proxy:**

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [ <paste your cookies array here> ],
    "proxy": "http://username:password@31.59.20.176:6754",
    "dolphin_profile_id": "123456"
  }'
```

> `proxy` field is optional. You can run an avatar without proxy, but it will increase the chance of blocking an account

The `proxy` field tells the automation server to use the same IP for all future requests for this profile — so the platform always sees a consistent IP.

Profile status becomes `ready` immediately. The avatar can now post automatically.

---

Repeat for each avatar × platform combination (`x-sarah-blaze`, `facebook-john-firemool`, etc.).

### Typical Workflow

```
1. Start service              →  npm start  (local)  or  docker compose up  (VPS)
2. Add new avatar             →  log in manually in Chrome, export cookies with Cookie-Editor
3. Import cookies             →  POST /profiles/x-avatarname/cookies
4. Check status               →  GET  /profiles
5. Post content               →  POST /post
6. Reply to a post            →  POST /reply
7. If session expires         →  re-export and re-import cookies for that avatar
8. Retire an avatar           →  DELETE /profiles/x-avatarname
```

## Dolphin Anty Integration

[Dolphin Anty](https://dolphin-anty.com) is an anti-detect browser that assigns each profile a unique, realistic browser fingerprint (WebGL, canvas, fonts, hardware metrics, User-Agent). When a Dolphin profile ID is attached to an avatar, the service connects to Dolphin via CDP instead of launching a plain Playwright browser — Dolphin owns the fingerprint and browser state, while the service drives it.

### When to use it

Use Dolphin when plain Playwright gets flagged by platform bot detection. It is optional — avatars without a `dolphinProfileId` continue to use the built-in Playwright path.

### Prerequisites

- Dolphin Anty installed and running (on VPS or local machine). The app exposes a local REST API — if you run both this service and Dolphin on the same host, make sure they use different ports (`PORT` for this service, Dolphin defaults to `3001`).
- An active [Dolphin Anty account](https://dolphin-anty.com) — the local API requires a Bearer token tied to your account.
- API token generated at `https://dolphin-anty.com/panel` → API tokens → Generate token. **Shown only once — copy it immediately.** Set it as `DOLPHIN_API_TOKEN` in `.env`.

### Profile management

Browser profiles (fingerprint, proxy, name) are created and managed entirely in the **Dolphin Anty desktop application** — not through this service's API. Use the desktop app to:

- Create profiles (assign fingerprint, proxy, OS, screen resolution)
- Clone or duplicate profiles as a starting point for new avatars
- Monitor which profiles are active

Each avatar should have its **own dedicated Dolphin profile** — sharing one profile ID across avatars defeats the anti-detect purpose (same fingerprint = same browser identity).

### Wiring a Dolphin profile to an avatar

Once you have a profile in Dolphin, copy its numeric ID from the desktop app and add it to the avatar's entry in `data/registry.json`:

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

From this point the avatar follows the normal cookie import flow (see [First-Time Launch](#first-time-launch)). The service will automatically use Dolphin's CDP endpoint instead of Playwright when it sees `dolphinProfileId`.

### Environment variables

```bash
DOLPHIN_API_URL=http://localhost:3001   # Dolphin local API (adjust port if needed)
DOLPHIN_API_TOKEN=your-token-here       # Bearer token from dolphin-anty.com panel
```

---

## API Reference

All API endpoints are available on [the following section](https://github.com/0xdeval/puppeteer/blob/main/API_REFERENCES.md)

## Other launching options

### Running with Docker

Use Docker when deploying to a VPS or when you want an isolated, reproducible environment.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — leave DATA_DIR as /app/data (the Docker default)

# 2. Build and start
docker compose up --build

# 3. Stop
docker compose down
```

Data (browser profiles, registry) is stored in a Docker volume and survives restarts.

| Port | Purpose |
| ---- | ------- |
| 3001 | API     |

---

### Deploying to RunPod (one click deployment)

For GPU-accelerated deployments using the local `qwen2.5vl:7b` model via Ollama, use the pre-built RunPod image defined in `Dockerfile.runpod`.

#### Why a custom image?

The base RunPod startup script downloads the model (~8-9 GB) every cold start, taking 3-10 minutes. The custom image bakes in the model at build time so startup takes **under 1 minute**.

#### Build and push the image

```bash
# Build (first time takes 15-30 min — model download is ~8-9 GB)
# --platform linux/amd64 is required when building on Apple Silicon (M1/M2/M3/M4)
docker build --platform linux/amd64 -f Dockerfile.runpod -t yourdockerhubuser/avatar-worker:latest .

# Push to Docker Hub
docker login
docker push yourdockerhubuser/avatar-worker:latest

# Subsequent builds are fast — model layer is cached, only npm layer rebuilds
```

Replace `yourdockerhubuser` with your actual Docker Hub username.

#### RunPod API request body (n8n)

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
    "API_SECRET": "your-secret",
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

#### What happens at runtime (`runpod-entrypoint.sh`)

1. SSH key from `SSH_PRIVATE_KEY` env var is written to `~/.ssh/id_rsa`
2. Repo is cloned from `git@github.com:0xdeval/puppeteer.git` into `/app` (pre-installed `node_modules` are preserved)
3. `/app/.env` is written from the env vars above
4. Xvfb virtual display is started (required for headed Playwright sessions)
5. Ollama is started — the model is already present so it's ready in ~10s
6. `npm run start` launches the API

#### Startup time breakdown

| Step                            | Time        |
| ------------------------------- | ----------- |
| SSH setup                       | ~2s         |
| `git clone`                     | ~5-10s      |
| `npm install` (diff only)       | ~5s         |
| Ollama ready (model pre-loaded) | ~10s        |
| **Total**                       | **~30-45s** |

Compared to **3-10 min** with the base image that downloads the model on every cold start.

---

## Platform Notes

- Use platform values consistently as `x` or `facebook` in request bodies.
- Keep profile IDs consistent with those platform values: `x-{avatar}` and `facebook-{avatar}`.
- Facebook posting uses the top-feed composer entry (`"What's on your mind, ...?"`). The bottom-right circular edit/pencil button is treated as messaging UI and is intentionally avoided.
- For Facebook posts with `image_url`, the service attaches the image first, then types text, to avoid copy disappearing after media attach.

---

## Rate Limits

Enforced per avatar per platform:

| Limit                          | Default    | Env var                   |
| ------------------------------ | ---------- | ------------------------- |
| Minimum interval between posts | 60 seconds | `RATE_LIMIT_MIN_INTERVAL` |
| Maximum posts per day          | 20         | `RATE_LIMIT_DAILY_MAX`    |

---

## Environment Variables

| Variable                  | Required | Default                     | Description                                                                                                 |
| ------------------------- | -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `API_SECRET`              | Yes      | —                           | API key for all requests                                                                                    |
| `LLM_PROVIDER`            | Yes      | —                           | `anthropic`, `openai`, or `ollama`                                                                          |
| `LLM_API_KEY`             | Yes\*    | —                           | API key for cloud LLM. \*Optional for ollama-only setups.                                                   |
| `LLM_MODEL_PRIMARY`       | No\*     | `claude-haiku-4-5-20251001` | Fast/cheap model for routine actions. \*Required when `LLM_PROVIDER=ollama`.                                |
| `LLM_MODEL_FALLBACK`      | No       | `claude-sonnet-4-20250514`  | More capable model for retries                                                                              |
| `LLM_BASE_URL`            | No\*     | —                           | Base URL for API endpoint. \*Required when `LLM_PROVIDER=ollama` (example: `http://192.168.1.14:11434/v1`). |
| `LLM_FALLBACK_PROVIDER`   | No       | same as primary             | Provider for fallback model                                                                                 |
| `LLM_FALLBACK_API_KEY`    | No       | —                           | API key for fallback provider                                                                               |
| `PORT`                    | No       | `3001`                      | API port                                                                                                    |
| `DATA_DIR`                | No       | `/app/data`                 | Where profiles and registry are stored. **Change this for local runs.**                                     |
| `MAX_BROWSER_TIMEOUT`     | No       | `120`                       | Max seconds a browser can run per request                                                                   |
| `MAX_AI_RETRIES`          | No       | `3`                         | Max AI retries per action step                                                                              |
| `RATE_LIMIT_MIN_INTERVAL` | No       | `60`                        | Min seconds between posts per avatar                                                                        |
| `RATE_LIMIT_DAILY_MAX`    | No       | `20`                        | Max posts per avatar per day                                                                                |
| `DOLPHIN_API_URL`         | No       | `http://localhost:3001`     | Local REST API URL of the Dolphin Anty app. Only needed when using Dolphin profiles.                        |
| `DOLPHIN_API_TOKEN`       | No       | —                           | Bearer token for the Dolphin API. Generate at dolphin-anty.com → panel → API tokens.                       |
| `SAVE_DEBUG_SCREENSHOTS`  | No       | `true`                      | Save screenshots on failure to `/data/debug/`                                                               |
| `NODE_ENV`                | No       | `production`                | `development` for verbose logging                                                                           |

---

## License

MIT
