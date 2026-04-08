# Platform Endpoints Guide

Short, practical reference for using this API by platform.

## Global Rules

- Base URL (local): `http://localhost:3001`
- Auth header on all endpoints except `/health`:

```http
x-api-key: <API_SECRET>
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

### X cookie import example

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [
      {
        "name": "auth_token",
        "value": "REDACTED",
        "domain": ".x.com",
        "path": "/",
        "httpOnly": true,
        "secure": true,
        "sameSite": "Lax"
      },
      {
        "name": "ct0",
        "value": "REDACTED",
        "domain": ".x.com",
        "path": "/",
        "httpOnly": false,
        "secure": true,
        "sameSite": "Lax"
      }
    ]
  }'
```

### Facebook cookie import example

```bash
curl -X POST http://localhost:3001/profiles/facebook-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [
      {
        "name": "c_user",
        "value": "REDACTED",
        "domain": ".facebook.com",
        "path": "/",
        "httpOnly": false,
        "secure": true,
        "sameSite": "None"
      },
      {
        "name": "xs",
        "value": "REDACTED",
        "domain": ".facebook.com",
        "path": "/",
        "httpOnly": true,
        "secure": true,
        "sameSite": "None"
      }
    ]
  }'
```

---

## X (Twitter)

### 1) Prepare session - import cookies from a profile

Import cookies:

```bash
curl -X POST http://localhost:3001/profiles/x-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{ "cookies": [ ... ] }'
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

Import cookies:

```bash
curl -X POST http://localhost:3001/profiles/facebook-john-firemool/cookies \
  -H "x-api-key: your-secret" \
  -H "Content-Type: application/json" \
  -d '{ "cookies": [ ... ] }'
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
