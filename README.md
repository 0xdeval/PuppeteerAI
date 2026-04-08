# Avatar Browser Service

A REST API that manages headless browser instances to post on social media (X/Twitter, Facebook) on behalf of multiple AI avatars. Each avatar has its own persistent browser profile so sessions survive between requests.

---

## How It Works

```
n8n / your app  →  POST /post  →  Avatar Browser Service  →  X / Facebook
                                          ↓
                               /data/profiles/{platform}-{avatar}/
                               (persistent cookies — avatar stays logged in)
```

- No browser stays open permanently. A browser launches per request, does the job, and closes.
- AI vision (Claude Haiku) drives all browser actions — no hardcoded selectors.
- Each avatar × platform pair has its own cookie profile stored on disk.

---

## Running Locally (no Docker)

**Prerequisites:** Node.js 20+, an Anthropic API key.

```bash
# 1. Install dependencies
npm install
npx playwright install chromium

# 2. Configure environment
cp .env.example .env
```

Edit `.env` — minimum required fields:

```env
API_SECRET=any-secret-string
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-your-key-here
DATA_DIR=/Users/yourname/path/to/project/data   # absolute local path
```

```bash
# 3. Start the server
npm start          # production
npm run dev        # auto-reload on file changes
```

Server listens on `http://localhost:3001`.

> **Note on noVNC:** The manual login flow (`GET /login/...`) opens a real browser window on your Mac desktop when running locally — no VNC needed. noVNC only applies when deployed to a headless VPS.

---

## Running with Docker (local / VPS)

Use Docker when deploying to a VPS or when you want an isolated, reproducible environment. noVNC is included in the Docker image for remote manual login.

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

| Port | Purpose                                 |
| ---- | --------------------------------------- |
| 3001 | API                                     |
| 6080 | noVNC (remote browser for manual login) |

> For VPS deployments, keep port 6080 behind a firewall or SSH tunnel — never expose it publicly.

---

## Deploying to RunPod (GPU — Ollama LLM)

For GPU-accelerated deployments using the local `qwen2.5-vl:14b` model via Ollama, use the pre-built RunPod image defined in `Dockerfile.runpod`.

### Why a custom image?

The base RunPod startup script downloads the model (~8-9 GB) every cold start, taking 3-10 minutes. The custom image bakes in the model at build time so startup takes **under 1 minute**.

### Build and push the image

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

### RunPod API request body (n8n)

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
    "LLM_MODEL_PRIMARY": "qwen2.5-vl:14b",
    "LLM_MODEL_FALLBACK": "qwen2.5-vl:14b",
    "PORT": "3001",
    "DATA_DIR": "/app/data"
  },
  "dockerStartCmd": ["/entrypoint.sh"]
}
```

### What happens at runtime (`runpod-entrypoint.sh`)

1. SSH key from `SSH_PRIVATE_KEY` env var is written to `~/.ssh/id_rsa`
2. Repo is cloned from `git@github.com:0xdeval/puppeteer.git` into `/app` (pre-installed `node_modules` are preserved)
3. `/app/.env` is written from the env vars above
4. Xvfb virtual display is started (required for headed Playwright sessions)
5. Ollama is started — the model is already present so it's ready in ~10s
6. `npm run start` launches the API

### Startup time breakdown

| Step                            | Time        |
| ------------------------------- | ----------- |
| SSH setup                       | ~2s         |
| `git clone`                     | ~5-10s      |
| `npm install` (diff only)       | ~5s         |
| Ollama ready (model pre-loaded) | ~10s        |
| **Total**                       | **~30-45s** |

Compared to **3-10 min** with the base image that downloads the model on every cold start.

---

## First-Time Setup for an Avatar

New avatars need a one-time session import before they can post automatically.

### Cookie Import (avoids bot detection and additional login)

X and Facebook actively block login attempts from automated browsers. The reliable approach is to log in normally in your real Chrome, export the cookies, and import them into the service.

> **Important — IP consistency:** Platforms track the IP address associated with each session. If you log in from one IP and then automate from a different IP (e.g. your Mac vs. a RunPod server), the account may be temporarily blocked. To prevent this, use the **same residential proxy** for both login on your machine and automation on RunPod. See the proxy setup steps below.

#### Proxy Setup (recommended to avoid IP mismatch blocks)

**Step 1 — Get a proxy.** [Webshare](https://webshare.io) offers a free tier with 10 proxies. After signing up, go to **Proxy List** to get your proxy credentials (`ip:port:username:password`).

**Step 2 — Install Webshare's Chrome extension.** On the Webshare dashboard, click **"Enhance Browsing with Chrome Extension → Install it Free"**. This routes your Chrome traffic through the proxy without auth issues.

**Step 3 — Whitelist your home IP on Webshare.** Go to **Proxy Settings → IP Authorizations** → add your current IP. This allows the proxy to work without credentials in the browser extension.

**Step 4 — Activate the proxy** in the Webshare extension before logging in.

**Step 5 — Verify** by visiting `ip.me` — you should see the proxy IP, not your real one.

#### Cookie Import Steps

**Step 1 — Install the [Cookie-Editor](https://cookie-editor.com) extension** in Chrome (with proxy active).

**Step 2 — Log into X (or Facebook) normally** in that browser as the avatar account.

**Step 3 — Export the cookies:**

- Click the Cookie-Editor icon
- Click **Export → Export as JSON**
- This copies the cookies JSON to your clipboard

**Step 4 — Import into the service, including the proxy:**

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [ <paste your cookies array here> ],
    "proxy": "http://username:password@31.59.20.176:6754"
  }'
```

The `proxy` field tells the automation server to use the same IP for all future requests for this profile — so the platform always sees a consistent IP.

Profile status becomes `ready` immediately. The avatar can now post automatically.

---

Repeat for each avatar × platform combination (`x-sarah-blaze`, `facebook-john-firemool`, etc.).

---

## Authentication

All endpoints except `GET /health` require:

```
x-api-key: <your API_SECRET>
```

---

## Platform Notes

- Use platform values consistently as `x` or `facebook` in request bodies.
- Keep profile IDs consistent with those platform values: `x-{avatar}` and `facebook-{avatar}`.
- Facebook posting uses the top-feed composer entry (`"What's on your mind, ...?"`). The bottom-right circular edit/pencil button is treated as messaging UI and is intentionally avoided.
- For Facebook posts with `image_url`, the service attaches the image first, then types text, to avoid copy disappearing after media attach.

---

## API Reference

### `GET /health`

Health check. No auth required.

```bash
curl http://localhost:3001/health
```

```json
{ "status": "ok", "timestamp": "2026-04-03T10:00:00Z" }
```

---

### `POST /post`

Post text (and optionally an image) to a social media platform.

```bash
curl -X POST http://localhost:3001/post \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "x",
    "text": "Just had the best coffee of my life.",
    "image_url": "https://example.com/coffee.jpg"
  }'
```

**Body fields:**

| Field       | Required | Description                                             |
| ----------- | -------- | ------------------------------------------------------- |
| `avatar`    | Yes      | Avatar identifier (lowercase, hyphenated)               |
| `platform`  | Yes      | `x` or `facebook`                                       |
| `text`      | Yes      | Post content                                            |
| `image_url` | No       | Image to attach. Service downloads it before uploading. |

**Platform-specific behaviour:**

- `x`: compose from feed/sidebar, type text, optional image, then publish.
- `facebook`: compose from top-feed `"What's on your mind, ...?"` entry. If scrolled down, the service scrolls up first. With `image_url`, image is attached before typing text.

**Responses:**

```json
// Success
{ "status": "posted", "avatar": "john-firemool", "platform": "x", "post_url": "https://x.com/...", "timestamp": "..." }

// Profile needs login first
{ "status": "needs_login", "avatar": "john-firemool", "platform": "x", "message": "...", "login_url": "http://localhost:3001/login/x-john-firemool" }

// Session expired (re-login required)
{ "status": "error", "error": "Session expired.", "needs_relogin": true }

// Rate limited
{ "status": "error", "error": "Rate limit: minimum 60s between posts." }
```

---

### `POST /reply`

Reply to an existing post.

```bash
curl -X POST http://localhost:3001/reply \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "x",
    "post_url": "https://x.com/user/status/123456789",
    "text": "Great take on this.",
    "image_url": null
  }'
```

**Body fields:**

| Field       | Required | Description                 |
| ----------- | -------- | --------------------------- |
| `avatar`    | Yes      | Avatar identifier           |
| `platform`  | Yes      | `x` or `facebook`           |
| `post_url`  | Yes      | URL of the post to reply to |
| `text`      | Yes      | Reply content               |
| `image_url` | No       | Optional image attachment   |

Response structure is identical to `/post`.

---

### `POST /profiles/:profileId/cookies`

Import cookies from a real browser session. This is the recommended authentication method — it completely bypasses bot detection on login pages.

`profileId` format: `{platform}-{avatar}` — e.g. `x-john-firemool`. The profile is created automatically if it doesn't exist.

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [
      { "name": "auth_token", "value": "abc123", "domain": ".x.com", ... },
      ...
    ],
    "proxy": "http://username:password@31.59.20.176:6754"
  }'
```

The `cookies` array is the JSON exported directly from the [Cookie-Editor](https://cookie-editor.com) browser extension — no transformation needed.

The optional `proxy` field stores a proxy for this profile so all automation uses the same IP the account was logged in from. Format: `http://user:pass@host:port`. Strongly recommended when logging in on one machine and automating from another (e.g. local Mac → RunPod).

```json
{
  "status": "ready",
  "profileId": "x-john-firemool",
  "cookiesImported": 42,
  "message": "Cookies imported. Profile is ready for posting."
}
```

---

### `GET /login/:profileId`

Open a browser for manual login. Creates the profile automatically if it doesn't exist yet.

`profileId` format: `{platform}-{avatar}` — e.g. `x-john-firemool`, `facebook-sarah-blaze`.

```bash
curl http://localhost:3001/login/x-john-firemool \
  -H "x-api-key: your-secret"
```

```json
{
  "status": "login_session_started",
  "profileId": "x-john-firemool",
  "vnc_url": "http://localhost:6080/vnc.html",
  "message": "Browser is open. Log in manually, then call POST /login/x-john-firemool/complete"
}
```

Locally, the browser window opens directly on your desktop. On a VPS, open the `vnc_url` in your browser.

---

### `POST /login/:profileId/complete`

Call this after you've finished logging in manually. Closes the browser and marks the profile as ready.

```bash
curl -X POST http://localhost:3001/login/x-john-firemool/complete \
  -H "x-api-key: your-secret"
```

```json
{
  "status": "ready",
  "profileId": "x-john-firemool",
  "message": "Profile is now active."
}
```

---

### `GET /profiles`

List all known avatar profiles and their statuses.

```bash
curl http://localhost:3001/profiles \
  -H "x-api-key: your-secret"
```

```json
{
  "profiles": [
    {
      "profileId": "x-john-firemool",
      "platform": "x",
      "avatar": "john-firemool",
      "status": "ready",
      "lastUsed": "2026-04-03T10:00:00Z"
    },
    {
      "profileId": "facebook-john-firemool",
      "platform": "facebook",
      "avatar": "john-firemool",
      "status": "needs_login",
      "lastUsed": null
    }
  ]
}
```

**Status values:**

| Status          | Meaning                                           |
| --------------- | ------------------------------------------------- |
| `ready`         | Valid session — can post automatically            |
| `needs_login`   | Profile created but never logged in               |
| `login_expired` | Session was valid but expired — re-login required |

---

### `DELETE /profiles/:profileId`

Remove a profile and all its data. Use when retiring an avatar.

```bash
curl -X DELETE http://localhost:3001/profiles/x-john-firemool \
  -H "x-api-key: your-secret"
```

```json
{ "status": "deleted", "profileId": "x-john-firemool" }
```

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
| `VNC_PORT`                | No       | `6080`                      | noVNC port                                                                                                  |
| `DATA_DIR`                | No       | `/app/data`                 | Where profiles and registry are stored. **Change this for local runs.**                                     |
| `MAX_BROWSER_TIMEOUT`     | No       | `120`                       | Max seconds a browser can run per request                                                                   |
| `MAX_AI_RETRIES`          | No       | `3`                         | Max AI retries per action step                                                                              |
| `RATE_LIMIT_MIN_INTERVAL` | No       | `60`                        | Min seconds between posts per avatar                                                                        |
| `RATE_LIMIT_DAILY_MAX`    | No       | `20`                        | Max posts per avatar per day                                                                                |
| `SAVE_DEBUG_SCREENSHOTS`  | No       | `true`                      | Save screenshots on failure to `/data/debug/`                                                               |
| `NODE_ENV`                | No       | `production`                | `development` for verbose logging                                                                           |

---

## Typical Workflow

```
1. Start service              →  npm start  (local)  or  docker compose up  (VPS)
2. Add new avatar             →  GET  /login/x-avatarname         (opens browser)
3. Log in manually            →  do it in the browser window / noVNC
4. Confirm login done         →  POST /login/x-avatarname/complete
5. Check status               →  GET  /profiles
6. Post content               →  POST /post
7. Reply to a post            →  POST /reply
8. If session expires         →  repeat steps 2-4 for that avatar
9. Retire an avatar           →  DELETE /profiles/x-avatarname
```

---

## Quick Platform Guide

For a short, platform-separated endpoint guide with ready-to-use examples, see:

- [PLATFORM_ENDPOINTS_GUIDE.md](PLATFORM_ENDPOINTS_GUIDE.md)
