# Platform Endpoints Guide

Short, practical reference for using this API by platform.

## Global Rules

- Base URL (local): `http://localhost:3001`
- All endpoints except `GET /health` require:

```
x-api-key: <your API_SECRET>
```

- Canonical platform values:
  - `x`
  - `facebook`
- Keep profile IDs aligned with platform values:
  - `x-{avatar}`
  - `facebook-{avatar}`

---

## Cookie Format (Manual Import)

Notes:

- Best source is full JSON export from Cookie-Editor (`Export as JSON`) with no transformation.
- Keep all cookies for the site, not only one or two.
- `expires` is Unix timestamp in seconds (`-1` is session cookie).
- Always include the `proxy` field if you logged in through a proxy — automation will use the same IP, preventing account blocks due to IP mismatch.

### Proxy setup (recommended)

Platforms detect when a session moves between IPs (e.g. logged in on your Mac, automated from RunPod). To avoid temporary blocks:

1. Get a proxy from [Webshare](https://webshare.io) (free tier: 10 proxies)
2. Install the Webshare Chrome extension and whitelist your home IP under **Proxy Settings → IP Authorizations**
3. Log in to the social account with the proxy active in Chrome
4. Export cookies with Cookie-Editor
5. Import cookies with the `proxy` field set — the server uses the same proxy for all automation

### X cookie import example

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [
      {
        "name": "auth_token",
        "value": "...",
        "domain": ".x.com",
        "path": "/",
        "httpOnly": true,
        "secure": true,
        "sameSite": "Lax"
      },
      {
        "name": "ct0",
        "value": "...",
        "domain": ".x.com",
        "path": "/",
        "httpOnly": false,
        "secure": true,
        "sameSite": "Lax"
      }
    ],
    "proxy": "http://username:password@31.59.20.176:6754",
    "dolphin_profile_id": "123456"
  }'
```

### Facebook cookie import example

```bash
curl -X POST http://localhost:3001/profiles/facebook-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d ' {
    "cookies": [
      {
        "name": "c_user",
        "value": "...",
        "domain": ".facebook.com",
        "path": "/",
        "httpOnly": false,
        "secure": true,
        "sameSite": "None"
      },
      {
        "name": "xs",
        "value": "...",
        "domain": ".facebook.com",
        "path": "/",
        "httpOnly": true,
        "secure": true,
        "sameSite": "None"
      },
      {
        "name": "datr",
        "value": "...",
        "domain": ".facebook.com",
        "path": "/",
        "httpOnly": true,
        "secure": true,
        "sameSite": "None"
      },
      {
        "name": "sb",
        "value": "...",
        "domain": ".facebook.com",
        "path": "/",
        "httpOnly": true,
        "secure": true,
        "sameSite": "None"
      }
    ],
    "proxy": "http://username:password@179.61.172.144:6695",
    "dolphin_profile_id": "123456"
  }'
```

---

## X (Twitter)

### 1) Prepare session - import cookies from a profile

Import cookies (include `proxy` if you logged in through one, `dolphin_profile_id` if using Dolphin Anty):

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [ ... ],
    "proxy": "http://user:pass@host:port",
    "dolphin_profile_id": "123456"
  }'
```

### 2) Create personal post

```bash
curl -X POST http://localhost:3001/post \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "x",
    "text": "Hello X!"

    # "image_url": null // Optional: if you want to use an image for a post
  }'
```

### 3) Reply to a post

```bash
curl -X POST http://localhost:3001/reply \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "x",
    "post_url": "https://x.com/user/status/123456789",
    "text": "Great take."
  }'
```

---

## Facebook

### 1) Prepare session - import cookies

Import cookies (include `proxy` if you logged in through one, `dolphin_profile_id` if using Dolphin Anty):

```bash
curl -X POST http://localhost:3001/profiles/facebook-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [ ... ],
    "proxy": "http://user:pass@host:port",
    "dolphin_profile_id": "123456"
  }'
```

### 2) Create a personal post

```bash
curl -X POST http://localhost:3001/post \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "facebook",
    "text": "Hello Facebook!"

    # "image_url": null // Optional: if you want to use an image for a post
  }'
```

Facebook posting notes:

- The service opens compose from the top-feed `"What's on your mind, ...?"` entry.
- If the feed is scrolled down, it scrolls up first.
- The bottom-right circular edit/pencil button is treated as messaging UI and is not used for feed posting.
- With `image_url`, image upload is performed before typing text to prevent copy reset.

### 3) Reply/comment on a post by URL

```bash
curl -X POST http://localhost:3001/reply \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "facebook",
    "post_url": "https://www.facebook.com/share/p/XXXXXXXXXXX/",
    "text": "Nice post!"
  }'
```

### 4) Scrape visible posts from a profile/page

```bash
curl -X POST http://localhost:3001/scrape \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar": "john-firemool",
    "platform": "facebook",
    "profile_url": "https://www.facebook.com/some.profile"
  }'
```

---

## Shared Utility Endpoints

Check health:

```bash
curl http://localhost:3001/health
```

List profiles:

```bash
curl http://localhost:3001/profiles \
  -H "x-api-key: your-secret"
```

Delete profile:

```bash
curl -X DELETE http://localhost:3001/profiles/facebook-john-firemool \
  -H "x-api-key: your-secret"
```
