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

## Running with Docker

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

## First-Time Setup for an Avatar

New avatars need a one-time session import before they can post automatically.

### Recommended: Cookie Import (avoids bot detection)

X and Facebook actively block login attempts from automated browsers. The reliable approach is to log in normally in your real Chrome, export the cookies, and import them into the service.

**Step 1 — Install the [Cookie-Editor](https://cookie-editor.com) extension** in your regular Chrome browser.

**Step 2 — Log into X (or Facebook) normally** in that browser as the avatar account.

**Step 3 — Export the cookies:**

- Click the Cookie-Editor icon
- Click **Export → Export as JSON**
- This copies the cookies JSON to your clipboard

**Step 4 — Import into the service:**

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{ "cookies": [ <paste your cookies array here> ] }'
```

Profile status becomes `ready` immediately. The avatar can now post automatically.

---

### Alternative: Manual Browser Login (noVNC / desktop window)

If cookie export isn't an option, you can try the browser-based login. Note: X's login page may block automated browsers regardless of stealth settings.

```bash
# Step 1: Open a login browser session
GET /login/x-john-firemool

# → Locally: a Chrome window opens on your desktop. Log in manually.
# → On VPS: connect to the noVNC URL returned in the response.

# Step 2: After logging in successfully, complete the session
POST /login/x-john-firemool/complete
```

---

Repeat for each avatar × platform combination (`x-sarah-blaze`, `fb-john-firemool`, etc.).

---

## Authentication

All endpoints except `GET /health` require:

```
x-api-key: <your API_SECRET>
```

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
    ]
  }'
```

The `cookies` array is the JSON exported directly from the [Cookie-Editor](https://cookie-editor.com) browser extension — no transformation needed.

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

`profileId` format: `{platform}-{avatar}` — e.g. `x-john-firemool`, `fb-sarah-blaze`.

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
      "profileId": "fb-john-firemool",
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
