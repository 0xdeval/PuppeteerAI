# Maintainability OSS Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the service into clear HTTP/service boundaries, remove duplicated orchestration code, and prepare the repository for maintainable open source publication.

**Architecture:** Keep Express, CommonJS, and the existing task/browser/provider modules. Extract `server.js` into a thin app composition layer, move request/response work into handlers, and centralize shared profile/rate-limit/browser orchestration in services with dependency injection for tests.

**Tech Stack:** Node.js 20+, Express 4, CommonJS, built-in `node:test`, built-in `assert`, Playwright/LLM modules unchanged.

---

## File Structure

Create:
- `src/app.js` - Express app factory and route composition.
- `src/http/middleware/auth.js` - API key auth middleware.
- `src/http/middleware/timeout.js` - HTTP timeout middleware.
- `src/http/routes/index.js` - Registers all route groups.
- `src/http/routes/health-routes.js` - Health route registration.
- `src/http/routes/profile-routes.js` - Profile/cookie route registration.
- `src/http/routes/automation-routes.js` - Post/reply/scrape route registration.
- `src/http/routes/debug-routes.js` - Debug route registration.
- `src/http/handlers/profile-handlers.js` - Profile/cookie HTTP handlers.
- `src/http/handlers/automation-handlers.js` - Post/reply/scrape HTTP handlers.
- `src/http/handlers/debug-handlers.js` - Debug HTTP handlers.
- `src/services/profile-service.js` - Profile ID parsing, ensure-profile, cookie-file operations.
- `src/services/automation-service.js` - Shared profile readiness, rate-limit, browser execution, and result normalization.
- `test/profile-service.test.js` - Profile service unit tests.
- `test/automation-service.test.js` - Automation service unit tests.
- `test/http-contract.test.js` - API contract tests using mocked service handlers.
- `CONTRIBUTING.md` - Contributor setup and PR expectations.
- `SECURITY.md` - Vulnerability and secret-handling guidance.
- `.github/ISSUE_TEMPLATE/bug_report.md` - Bug template.
- `.github/ISSUE_TEMPLATE/feature_request.md` - Feature template.
- `.github/pull_request_template.md` - PR checklist.

Modify:
- `server.js` - Replace monolithic Express app with start-only entrypoint.
- `package.json` - Add `test` script using `node --test`.
- `README.md` - Rewrite top framing, quickstart, use cases, architecture, API examples, contribution links.
- `.env.example` - Clarify contributor-facing setup comments.
- `API_REFERENCES.md` - Update response/endpoint notes if response wording is normalized.

Do not change:
- `src/tasks/post.js`, `src/tasks/reply.js`, `src/tasks/scrape.js` unless tests reveal behavior bugs.
- `src/browser.js`, `src/dolphin.js`, `src/ai/*` unless imports need narrow cleanup.

---

## Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Create: `test/profile-service.test.js`
- Create: `test/automation-service.test.js`
- Create: `test/http-contract.test.js`

- [ ] **Step 1: Add a test script**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "healthcheck": "bash scripts/healthcheck.sh",
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Add failing profile service tests**

Create `test/profile-service.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createProfileService,
} = require('../src/services/profile-service');

test('parseProfileId accepts platform-avatar format', () => {
  const service = createProfileService();

  assert.deepEqual(service.parseProfileId('x-jane-doe'), {
    platform: 'x',
    avatar: 'jane-doe',
  });
});

test('parseProfileId rejects ids without platform and avatar', () => {
  const service = createProfileService();

  assert.throws(
    () => service.parseProfileId('badprofile'),
    /profileId must be in format/
  );
});

test('ensureProfile creates missing profile with needs_login status', () => {
  const calls = [];
  const service = createProfileService({
    generateProfileId: (platform, avatar) => `${platform}-${avatar}`,
    getProfile: () => null,
    createProfile: (profileId, data) => {
      calls.push({ profileId, data });
      return { id: profileId, ...data };
    },
  });

  const result = service.ensureProfile('facebook', 'alice');

  assert.equal(result.profileId, 'facebook-alice');
  assert.equal(result.profile.status, 'needs_login');
  assert.deepEqual(calls, [{
    profileId: 'facebook-alice',
    data: { platform: 'facebook', avatar: 'alice', status: 'needs_login' },
  }]);
});
```

- [ ] **Step 3: Add failing automation service tests**

Create `test/automation-service.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createAutomationService,
} = require('../src/services/automation-service');

function makeService(overrides = {}) {
  const deps = {
    ensureProfile: () => ({
      profileId: 'x-alice',
      profile: { id: 'x-alice', status: 'ready' },
    }),
    checkRateLimit: () => ({ allowed: true }),
    recordPost: () => {},
    updateProfile: () => {},
    getBrowserForProfile: async (_profileId, _options, job) => job('browser', 'page'),
    sleep: async () => {},
    ...overrides,
  };
  return createAutomationService(deps);
}

test('post rejects profiles that still need login', async () => {
  const service = makeService({
    ensureProfile: () => ({
      profileId: 'x-alice',
      profile: { id: 'x-alice', status: 'needs_login' },
    }),
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'posted', post_url: 'https://x.com/p/1' }),
  });

  assert.equal(result.httpStatus, 403);
  assert.equal(result.body.needs_relogin, true);
  assert.equal(result.body.profileId, 'x-alice');
});

test('post waits through short rate limit and then runs job', async () => {
  const slept = [];
  const service = makeService({
    checkRateLimit: () => ({ allowed: false, retryAfter: 2, reason: 'wait' }),
    sleep: async (ms) => slept.push(ms),
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'posted', post_url: 'https://x.com/p/1' }),
  });

  assert.deepEqual(slept, [2000]);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.success, true);
});

test('post maps browser busy to 429', async () => {
  const service = makeService({
    getBrowserForProfile: async () => {
      throw Object.assign(new Error('busy'), { code: 'PROFILE_BUSY' });
    },
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'posted' }),
  });

  assert.equal(result.httpStatus, 429);
  assert.equal(result.body.retryAfter, 30);
});

test('scrape maps login_required to relogin response', async () => {
  const service = makeService();

  const result = await service.runScrape({
    platform: 'facebook',
    avatar: 'alice',
    profile_url: 'https://facebook.com/alice',
    limit: null,
    scrapeProfilePosts: async () => ({
      status: 'login_required',
      error: 'Facebook requires login.',
    }),
  });

  assert.equal(result.httpStatus, 403);
  assert.equal(result.body.needs_relogin, true);
});
```

- [ ] **Step 4: Add failing HTTP contract tests**

Create `test/http-contract.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/app');

async function request(server, method, path, body, apiKey = 'secret') {
  const address = server.address();
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path,
      headers: {
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        ...(payload ? {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        } : {}),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /health does not require auth', async () => {
  const app = createApp({ apiSecret: 'secret' });

  await withServer(app, async (server) => {
    const res = await request(server, 'GET', '/health', null, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
  });
});

test('POST /post validates required fields before service call', async () => {
  const app = createApp({ apiSecret: 'secret' });

  await withServer(app, async (server) => {
    const res = await request(server, 'POST', '/post', { platform: 'x' });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /platform, avatar, and text are required/);
  });
});

test('POST /reply delegates valid request and returns service result', async () => {
  const app = createApp({
    apiSecret: 'secret',
    automationService: {
      runReply: async () => ({
        httpStatus: 200,
        body: { success: true, post_url: 'https://x.com/p/1', profileId: 'x-alice' },
      }),
    },
  });

  await withServer(app, async (server) => {
    const res = await request(server, 'POST', '/reply', {
      platform: 'x',
      avatar: 'alice',
      post_url: 'https://x.com/post/1',
      text: 'reply',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });
});
```

- [ ] **Step 5: Run tests and verify they fail for missing modules**

Run:

```bash
npm test
```

Expected: fails with missing module errors for `src/services/profile-service`, `src/services/automation-service`, or `src/app`.

- [ ] **Step 6: Commit test harness**

```bash
git add package.json test
git commit -m "Add contract tests for refactor boundaries" -m "Constraint: Use built-in Node test runner to avoid new dependencies.
Confidence: high
Scope-risk: narrow
Tested: npm test fails on missing planned modules as expected.
Not-tested: Runtime browser automation."
```

---

## Task 2: Extract Profile Service

**Files:**
- Create: `src/services/profile-service.js`
- Test: `test/profile-service.test.js`

- [ ] **Step 1: Implement profile service**

Create `src/services/profile-service.js`:

```js
'use strict';

const fs = require('fs');
const path = require('path');

const profiles = require('../profiles');
const { generateProfileId } = require('../utils');

function createProfileService(deps = {}) {
  const getProfile = deps.getProfile || profiles.getProfile;
  const createProfile = deps.createProfile || profiles.createProfile;
  const updateProfile = deps.updateProfile || profiles.updateProfile;
  const profileDir = deps.profileDir || profiles.profileDir;
  const makeProfileId = deps.generateProfileId || generateProfileId;
  const fsImpl = deps.fs || fs;

  function ensureProfile(platform, avatar) {
    const profileId = makeProfileId(platform, avatar);
    let profile = getProfile(profileId);
    if (!profile) {
      profile = createProfile(profileId, { platform, avatar, status: 'needs_login' });
    }
    return { profile, profileId };
  }

  function parseProfileId(profileId) {
    const firstDash = profileId.indexOf('-');
    const platform = firstDash !== -1 ? profileId.slice(0, firstDash) : '';
    const avatar = firstDash !== -1 ? profileId.slice(firstDash + 1) : '';

    if (!platform || !avatar) {
      throw new Error('profileId must be in format {platform}-{avatar}, e.g. x-john-firemool');
    }

    return { platform, avatar };
  }

  function ensureProfileById(profileId) {
    const { platform, avatar } = parseProfileId(profileId);
    let profile = getProfile(profileId);
    if (!profile) {
      profile = createProfile(profileId, { platform, avatar, status: 'needs_login' });
    }
    return { profile, profileId, platform, avatar };
  }

  function getCookiesPath(profileId) {
    return path.join(profileDir(profileId), 'cookies.json');
  }

  function saveCookies(profileId, cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error('`cookies` must be a non-empty array.');
    }

    const cookiesPath = getCookiesPath(profileId);
    fsImpl.mkdirSync(path.dirname(cookiesPath), { recursive: true });
    fsImpl.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2), 'utf8');
    return cookiesPath;
  }

  function readCookiesSummary(profileId) {
    const cookiesPath = getCookiesPath(profileId);
    if (!fsImpl.existsSync(cookiesPath)) {
      return null;
    }

    const cookies = JSON.parse(fsImpl.readFileSync(cookiesPath, 'utf8'));
    return {
      profileId,
      cookieCount: cookies.length,
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        hasValue: !!cookie.value,
        valueLength: cookie.value?.length,
      })),
    };
  }

  function markCookiesImported(profileId, { proxy, dolphinProfileId } = {}) {
    return updateProfile(profileId, {
      status: 'ready',
      lastLoginAt: new Date().toISOString(),
      ...(proxy ? { proxy } : {}),
      ...(dolphinProfileId ? { dolphinProfileId } : {}),
    });
  }

  return {
    ensureProfile,
    parseProfileId,
    ensureProfileById,
    getCookiesPath,
    saveCookies,
    readCookiesSummary,
    markCookiesImported,
  };
}

module.exports = {
  createProfileService,
  profileService: createProfileService(),
};
```

- [ ] **Step 2: Run profile service tests**

Run:

```bash
node --test test/profile-service.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit profile service**

```bash
git add src/services/profile-service.js test/profile-service.test.js
git commit -m "Centralize profile helpers for HTTP handlers" -m "Constraint: Preserve profile ID format and cookie file location.
Confidence: high
Scope-risk: narrow
Tested: node --test test/profile-service.test.js
Not-tested: Browser cookie injection path."
```

---

## Task 3: Extract Automation Service

**Files:**
- Create: `src/services/automation-service.js`
- Test: `test/automation-service.test.js`

- [ ] **Step 1: Implement automation service**

Create `src/services/automation-service.js`:

```js
'use strict';

const { getBrowserForProfile } = require('../browser');
const {
  checkRateLimit,
  recordPost,
  updateProfile,
} = require('../profiles');
const { profileService } = require('./profile-service');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAutomationService(deps = {}) {
  const ensureProfile = deps.ensureProfile || profileService.ensureProfile;
  const checkLimit = deps.checkRateLimit || checkRateLimit;
  const recordSuccessfulPost = deps.recordPost || recordPost;
  const updateProfileRecord = deps.updateProfile || updateProfile;
  const runBrowser = deps.getBrowserForProfile || getBrowserForProfile;
  const wait = deps.sleep || sleep;

  async function enforceRateLimit(profileId) {
    const rateCheck = checkLimit(profileId);
    if (rateCheck.allowed) return null;

    if (rateCheck.retryAfter && rateCheck.retryAfter <= 120) {
      await wait(rateCheck.retryAfter * 1000);
      return null;
    }

    return {
      httpStatus: 429,
      body: { error: rateCheck.reason, retryAfter: rateCheck.retryAfter },
    };
  }

  function mapBrowserError(error) {
    if (error.code === 'PROFILE_BUSY') {
      return {
        httpStatus: 429,
        body: { error: error.message, retryAfter: 30 },
      };
    }

    if (error.code === 'BROWSER_TIMEOUT') {
      return {
        httpStatus: 504,
        body: { error: 'Browser task timed out.' },
      };
    }

    throw error;
  }

  async function runWithBrowser(profileId, platform, task) {
    try {
      return await runBrowser(profileId, { platform }, async (browser, page) => task(browser, page));
    } catch (error) {
      return mapBrowserError(error);
    }
  }

  async function prepareProfile(platform, avatar, actionLabel) {
    const { profile, profileId } = ensureProfile(platform, avatar);

    if (profile.status === 'needs_login') {
      return {
        blocked: {
          httpStatus: 403,
          body: {
            error: `Profile needs login before ${actionLabel}.`,
            needs_relogin: true,
            profileId,
          },
        },
      };
    }

    const rateLimitResult = await enforceRateLimit(profileId);
    if (rateLimitResult) {
      return { blocked: rateLimitResult };
    }

    return { profile, profileId };
  }

  function mapPostLikeResult(profileId, result, failureMessage) {
    if (result.status === 'posted') {
      recordSuccessfulPost(profileId, { postId: result.post_url });
      return {
        httpStatus: 200,
        body: { success: true, post_url: result.post_url, profileId },
      };
    }

    if (result.status === 'login_expired') {
      updateProfileRecord(profileId, { status: 'login_expired' });
      return {
        httpStatus: 403,
        body: {
          error: result.error || 'Session expired.',
          needs_relogin: true,
          profileId,
        },
      };
    }

    return {
      httpStatus: 500,
      body: { error: result.error || failureMessage },
    };
  }

  async function runPost({ platform, avatar, text, imagePath, postContent }) {
    const prepared = await prepareProfile(platform, avatar, 'posting');
    if (prepared.blocked) return prepared.blocked;

    const result = await runWithBrowser(prepared.profileId, platform, (_browser, page) =>
      postContent(page, { platform, text, imagePath, avatar }, null)
    );

    if (result.httpStatus) return result;
    return mapPostLikeResult(prepared.profileId, result, 'Post failed for unknown reason.');
  }

  async function runReply({ platform, avatar, post_url, text, replyToPost }) {
    const prepared = await prepareProfile(platform, avatar, 'replying');
    if (prepared.blocked) return prepared.blocked;

    const result = await runWithBrowser(prepared.profileId, platform, (_browser, page) =>
      replyToPost(page, { platform, post_url, text, avatar }, null)
    );

    if (result.httpStatus) return result;
    return mapPostLikeResult(prepared.profileId, result, 'Reply failed for unknown reason.');
  }

  async function runScrape({ platform, avatar, profile_url, limit, scrapeProfilePosts }) {
    const { profileId } = ensureProfile(platform, avatar);

    const result = await runWithBrowser(profileId, platform, (_browser, page) =>
      scrapeProfilePosts(page, { profile_url, avatar, limit })
    );

    if (result.httpStatus) return result;

    if (result.status === 'ok') {
      return {
        httpStatus: 200,
        body: { success: true, posts: result.posts, profileId },
      };
    }

    if (result.status === 'login_required') {
      return {
        httpStatus: 403,
        body: {
          error: result.error || 'Facebook requires login to view this page.',
          needs_relogin: true,
          profileId,
        },
      };
    }

    return {
      httpStatus: 500,
      body: { error: result.error || 'Scrape failed for unknown reason.' },
    };
  }

  return {
    runPost,
    runReply,
    runScrape,
  };
}

module.exports = {
  createAutomationService,
  automationService: createAutomationService(),
};
```

- [ ] **Step 2: Run automation service tests**

Run:

```bash
node --test test/automation-service.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit automation service**

```bash
git add src/services/automation-service.js test/automation-service.test.js
git commit -m "Centralize browser automation result handling" -m "Constraint: Preserve current profile readiness, short wait, busy, and timeout semantics.
Confidence: high
Scope-risk: moderate
Tested: node --test test/automation-service.test.js
Not-tested: Real browser sessions."
```

---

## Task 4: Extract HTTP App, Middleware, Routes, and Handlers

**Files:**
- Create: `src/app.js`
- Create: `src/http/middleware/auth.js`
- Create: `src/http/middleware/timeout.js`
- Create: `src/http/routes/index.js`
- Create: `src/http/routes/health-routes.js`
- Create: `src/http/routes/profile-routes.js`
- Create: `src/http/routes/automation-routes.js`
- Create: `src/http/routes/debug-routes.js`
- Create: `src/http/handlers/profile-handlers.js`
- Create: `src/http/handlers/automation-handlers.js`
- Create: `src/http/handlers/debug-handlers.js`
- Test: `test/http-contract.test.js`

- [ ] **Step 1: Add auth middleware**

Create `src/http/middleware/auth.js`:

```js
'use strict';

function createRequireAuth(apiSecret) {
  return function requireAuth(req, res, next) {
    if (!apiSecret) {
      return res.status(500).json({ error: 'API_SECRET not configured on server.' });
    }

    const key = req.headers['x-api-key'];
    if (!key || key !== apiSecret) {
      return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header.' });
    }

    next();
  };
}

function createRequireAuthOrQuery(apiSecret) {
  return function requireAuthOrQuery(req, res, next) {
    if (!apiSecret) {
      return res.status(500).json({ error: 'API_SECRET not configured on server.' });
    }

    const key = req.headers['x-api-key'] || req.query.key;
    if (!key || key !== apiSecret) {
      return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header or ?key= query param.' });
    }

    next();
  };
}

module.exports = {
  createRequireAuth,
  createRequireAuthOrQuery,
};
```

- [ ] **Step 2: Add timeout middleware**

Create `src/http/middleware/timeout.js`:

```js
'use strict';

function createTimeoutMiddleware(timeoutMs) {
  return function timeoutMiddleware(req, res, next) {
    res.setTimeout(timeoutMs);
    next();
  };
}

module.exports = {
  createTimeoutMiddleware,
};
```

- [ ] **Step 3: Add automation handlers**

Create `src/http/handlers/automation-handlers.js`:

```js
'use strict';

const { postContent } = require('../../tasks/post');
const { replyToPost } = require('../../tasks/reply');
const { scrapeProfilePosts } = require('../../tasks/scrape');
const { downloadImage, cleanupTempFile } = require('../../utils');

function createAutomationHandlers({ automationService }) {
  async function post(req, res, next) {
    const { platform, avatar, text, image_url } = req.body;

    if (!platform || !avatar || !text) {
      return res.status(400).json({ error: 'platform, avatar, and text are required.' });
    }

    let imagePath = null;

    try {
      if (image_url) {
        try {
          imagePath = await downloadImage(image_url);
        } catch (error) {
          return res.status(400).json({ error: `Failed to download image: ${error.message}` });
        }
      }

      const result = await automationService.runPost({
        platform,
        avatar,
        text,
        imagePath,
        postContent,
      });

      return res.status(result.httpStatus).json(result.body);
    } catch (error) {
      next(error);
    } finally {
      await cleanupTempFile(imagePath);
    }
  }

  async function reply(req, res, next) {
    const { platform, avatar, post_url, text } = req.body;

    if (!platform || !avatar || !post_url || !text) {
      return res.status(400).json({ error: 'platform, avatar, post_url, and text are required.' });
    }

    try {
      const result = await automationService.runReply({
        platform,
        avatar,
        post_url,
        text,
        replyToPost,
      });

      return res.status(result.httpStatus).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async function scrape(req, res, next) {
    const { platform, avatar, profile_url, limit } = req.body;

    if (!platform || !avatar || !profile_url) {
      return res.status(400).json({ error: 'platform, avatar, and profile_url are required.' });
    }

    const postLimit = limit != null ? parseInt(limit, 10) : null;
    if (postLimit !== null && (Number.isNaN(postLimit) || postLimit < 1)) {
      return res.status(400).json({ error: 'limit must be a positive integer.' });
    }

    try {
      const result = await automationService.runScrape({
        platform,
        avatar,
        profile_url,
        limit: postLimit,
        scrapeProfilePosts,
      });

      return res.status(result.httpStatus).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  return {
    post,
    reply,
    scrape,
  };
}

module.exports = {
  createAutomationHandlers,
};
```

- [ ] **Step 4: Add profile handlers**

Create `src/http/handlers/profile-handlers.js`:

```js
'use strict';

const profiles = require('../../profiles');

function createProfileHandlers({ profileService }) {
  function listProfiles(req, res) {
    res.json({ profiles: profiles.getAllProfiles() });
  }

  function deleteProfile(req, res, next) {
    const { profileId } = req.params;
    try {
      profiles.deleteProfile(profileId);
      res.json({ success: true, profileId });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }

  function importCookies(req, res, next) {
    const { profileId } = req.params;
    const { cookies, proxy, dolphin_profile_id } = req.body;

    if (!Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ error: '`cookies` must be a non-empty array.' });
    }

    try {
      profileService.ensureProfileById(profileId);
      profileService.saveCookies(profileId, cookies);
      profileService.markCookiesImported(profileId, {
        proxy,
        dolphinProfileId: dolphin_profile_id,
      });

      res.json({
        status: 'ready',
        profileId,
        cookiesImported: cookies.length,
        dolphinProfileId: dolphin_profile_id || null,
        message: 'Cookies saved. Profile is ready for posting.',
      });
    } catch (error) {
      if (error.message.includes('profileId must be in format')) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  function showCookies(req, res, next) {
    const { profileId } = req.params;

    try {
      const summary = profileService.readCookiesSummary(profileId);
      if (!summary) {
        return res.status(404).json({ error: 'No cookies file found for this profile.' });
      }
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  return {
    listProfiles,
    deleteProfile,
    importCookies,
    showCookies,
  };
}

module.exports = {
  createProfileHandlers,
};
```

- [ ] **Step 5: Add debug handlers**

Create `src/http/handlers/debug-handlers.js`:

```js
'use strict';

const fs = require('fs');
const path = require('path');

function createDebugHandlers({ dataDir }) {
  const debugDir = path.join(dataDir, 'debug');

  function listDebugFiles(req, res) {
    if (!fs.existsSync(debugDir)) {
      return res.json({ screenshots: [], logs: [] });
    }

    const all = fs.readdirSync(debugDir).sort().reverse();
    const screenshots = all
      .filter((filename) => filename.endsWith('.png'))
      .map((filename) => ({ filename, url: `/debug/${encodeURIComponent(filename)}` }));
    const logs = all
      .filter((filename) => filename.endsWith('.json'))
      .map((filename) => ({ filename, url: `/debug/${encodeURIComponent(filename)}` }));

    res.json({ screenshots, logs });
  }

  function showDebugFile(req, res) {
    const { filename } = req.params;

    if (!/^[\p{L}\p{N}\w\-.:]+\.(png|json)$/iu.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    const filepath = path.join(debugDir, filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Debug file not found.' });
    }

    const isPng = filename.endsWith('.png');
    res.setHeader('Content-Type', isPng ? 'image/png' : 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(filepath).pipe(res);
  }

  return {
    listDebugFiles,
    showDebugFile,
  };
}

module.exports = {
  createDebugHandlers,
};
```

- [ ] **Step 6: Add route modules**

Create `src/http/routes/health-routes.js`:

```js
'use strict';

function registerHealthRoutes(app) {
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

module.exports = {
  registerHealthRoutes,
};
```

Create `src/http/routes/automation-routes.js`:

```js
'use strict';

function registerAutomationRoutes(app, { requireAuth, automationHandlers }) {
  app.post('/post', requireAuth, automationHandlers.post);
  app.post('/reply', requireAuth, automationHandlers.reply);
  app.post('/scrape', requireAuth, automationHandlers.scrape);
}

module.exports = {
  registerAutomationRoutes,
};
```

Create `src/http/routes/profile-routes.js`:

```js
'use strict';

function registerProfileRoutes(app, { requireAuth, profileHandlers }) {
  app.get('/profiles', requireAuth, profileHandlers.listProfiles);
  app.delete('/profiles/:profileId', requireAuth, profileHandlers.deleteProfile);
  app.post('/profiles/:profileId/cookies', requireAuth, profileHandlers.importCookies);
  app.get('/profiles/:profileId/cookies', requireAuth, profileHandlers.showCookies);
}

module.exports = {
  registerProfileRoutes,
};
```

Create `src/http/routes/debug-routes.js`:

```js
'use strict';

function registerDebugRoutes(app, { requireAuthOrQuery, debugHandlers }) {
  app.get('/debug', requireAuthOrQuery, debugHandlers.listDebugFiles);
  app.get('/debug/:filename', requireAuthOrQuery, debugHandlers.showDebugFile);
}

module.exports = {
  registerDebugRoutes,
};
```

Create `src/http/routes/index.js`:

```js
'use strict';

const { registerHealthRoutes } = require('./health-routes');
const { registerAutomationRoutes } = require('./automation-routes');
const { registerProfileRoutes } = require('./profile-routes');
const { registerDebugRoutes } = require('./debug-routes');

function registerRoutes(app, deps) {
  registerHealthRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerAutomationRoutes(app, deps);
  registerDebugRoutes(app, deps);
}

module.exports = {
  registerRoutes,
};
```

- [ ] **Step 7: Add app factory**

Create `src/app.js`:

```js
'use strict';

const express = require('express');
const path = require('path');

const { automationService: defaultAutomationService } = require('./services/automation-service');
const { profileService: defaultProfileService } = require('./services/profile-service');
const { createAutomationHandlers } = require('./http/handlers/automation-handlers');
const { createProfileHandlers } = require('./http/handlers/profile-handlers');
const { createDebugHandlers } = require('./http/handlers/debug-handlers');
const { createRequireAuth, createRequireAuthOrQuery } = require('./http/middleware/auth');
const { createTimeoutMiddleware } = require('./http/middleware/timeout');
const { registerRoutes } = require('./http/routes');

function createApp(options = {}) {
  const app = express();

  const apiSecret = options.apiSecret ?? process.env.API_SECRET;
  const timeoutMs = options.httpTimeoutMs ??
    parseInt(process.env.MAX_BROWSER_TIMEOUT || '600', 10) * 1000;
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const automationService = options.automationService || defaultAutomationService;
  const profileService = options.profileService || defaultProfileService;

  app.use(express.json({ limit: '10mb' }));
  app.use(createTimeoutMiddleware(timeoutMs));

  const requireAuth = createRequireAuth(apiSecret);
  const requireAuthOrQuery = createRequireAuthOrQuery(apiSecret);
  const automationHandlers = createAutomationHandlers({ automationService });
  const profileHandlers = createProfileHandlers({ profileService });
  const debugHandlers = createDebugHandlers({ dataDir });

  registerRoutes(app, {
    requireAuth,
    requireAuthOrQuery,
    automationHandlers,
    profileHandlers,
    debugHandlers,
  });

  app.use((err, req, res, next) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = {
  createApp,
};
```

- [ ] **Step 8: Run HTTP contract tests**

Run:

```bash
node --test test/http-contract.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit HTTP extraction**

```bash
git add src/app.js src/http test/http-contract.test.js
git commit -m "Extract HTTP routes and handlers from server entrypoint" -m "Constraint: Keep public routes and validation messages stable.
Confidence: high
Scope-risk: moderate
Tested: node --test test/http-contract.test.js
Not-tested: Real social platform browser flows."
```

---

## Task 5: Thin `server.js` Entrypoint

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Replace server.js with startup-only entrypoint**

Replace `server.js` with:

```js
'use strict';

require('dotenv').config();

const { createApp } = require('./src/app');
const { cleanupOldTempFiles } = require('./src/utils');

const PORT = parseInt(process.env.PORT || '3001', 10);

cleanupOldTempFiles().catch((err) =>
  console.warn('[server] Startup temp cleanup failed:', err.message)
);

const app = createApp();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] Avatar Browser Service listening on port ${PORT}`);
    console.log(`[server] LLM provider: ${process.env.LLM_PROVIDER || 'anthropic'}`);
    console.log(`[server] Data dir: ${process.env.DATA_DIR || './data'}`);
  });
}

module.exports = app;
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Smoke-check app module load**

Run:

```bash
node -e "require('./server'); console.log('server module loaded')"
```

Expected: prints `server module loaded` and exits without listening on a port.

- [ ] **Step 4: Commit server entrypoint**

```bash
git add server.js
git commit -m "Make server entrypoint compose extracted app" -m "Constraint: Preserve npm start behavior while making app importable for tests.
Confidence: high
Scope-risk: narrow
Tested: npm test; node -e require('./server')
Not-tested: Long-running production server."
```

---

## Task 6: Remove Redundant Code and Verify Imports

**Files:**
- Modify as needed: `src/**/*.js`

- [ ] **Step 1: Search for stale direct route helper duplication**

Run:

```bash
rg -n "function ensureProfile|function requireAuth|function requireAuthOrQuery|function sleep|profileDir\\(|cookiesPath|PROFILE_BUSY|BROWSER_TIMEOUT" server.js src
```

Expected:
- `requireAuth` only in `src/http/middleware/auth.js`
- `sleep`, `PROFILE_BUSY`, and `BROWSER_TIMEOUT` only in `src/services/automation-service.js` and `src/browser.js`
- cookie path construction only in `src/services/profile-service.js` and browser cookie injection in `src/browser.js`

- [ ] **Step 2: Remove stale imports**

If `server.js` still imports `express`, `path`, `fs`, `getBrowserForProfile`, `profiles`, task modules, or debug helpers directly, remove them. Final `server.js` imports only:

```js
require('dotenv').config();

const { createApp } = require('./src/app');
const { cleanupOldTempFiles } = require('./src/utils');
```

- [ ] **Step 3: Run syntax/import check**

Run:

```bash
node -e "require('./src/app'); require('./src/services/profile-service'); require('./src/services/automation-service'); console.log('imports ok')"
```

Expected: prints `imports ok`.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit cleanup**

```bash
git add server.js src
git commit -m "Remove duplicated HTTP orchestration code" -m "Constraint: Keep browser and task internals unchanged.
Confidence: high
Scope-risk: moderate
Tested: npm test; import smoke check
Not-tested: Live X/Facebook automation."
```

---

## Task 7: OSS Documentation and Templates

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Rewrite README top structure**

Update `README.md` so the top-level order is:

```markdown
# Avatar Browser Service

AI-guided browser automation for posting and replying on X and Facebook with persistent per-avatar browser profiles.

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

## Quickstart

...
```

Keep existing useful setup details, Dolphin notes, API examples, rate limits, and environment variable sections. Remove duplicated prose and move long cookie-export guidance below the quickstart.

- [ ] **Step 2: Clarify `.env.example` comments**

Make sure `.env.example` explains:

```bash
# Required for all protected endpoints. Use a long random value in real deployments.
API_SECRET=change-me-to-a-strong-random-secret

# Required unless LLM_PROVIDER=ollama.
LLM_API_KEY=your-anthropic-or-openai-api-key-here

# Optional. Use Dolphin only when you need anti-detect browser fingerprints.
# DOLPHIN_API_URL=http://localhost:3001
# DOLPHIN_API_TOKEN=your-dolphin-api-token-here
```

- [ ] **Step 3: Add CONTRIBUTING.md**

Create `CONTRIBUTING.md`:

```markdown
# Contributing

## Local Setup

1. Install Node.js 20+.
2. Install dependencies with `npm install`.
3. Install Chromium with `npx playwright install chromium`.
4. Copy `.env.example` to `.env` and set `API_SECRET` plus one LLM provider.
5. Run tests with `npm test`.
6. Start the service with `npm start`.

## Development Rules

- Keep endpoint behavior backward compatible unless the change is documented.
- Add or update tests for shared service behavior and route contracts.
- Do not commit `.env`, browser profiles, cookies, screenshots, or debug logs.
- Prefer small focused modules over adding logic to `server.js`.

## Pull Requests

- Explain the user-facing behavior change.
- Include test evidence.
- Document any API response or environment variable changes.
```

- [ ] **Step 4: Add SECURITY.md**

Create `SECURITY.md`:

```markdown
# Security

## Reporting Vulnerabilities

Please report security issues privately to the project maintainer instead of opening a public issue. Include reproduction steps, affected configuration, and any relevant logs with secrets removed.

## Secret Handling

- Never commit `.env`, cookies, profile data, Dolphin tokens, API keys, or debug screenshots.
- Treat exported social platform cookies as account credentials.
- Use a strong `API_SECRET` for every non-local deployment.
- Keep `DATA_DIR` on trusted storage because it contains browser sessions.
```

- [ ] **Step 5: Add issue and PR templates**

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Report a reproducible problem
title: "[Bug]: "
labels: bug
assignees: ""
---

## What happened?

## Expected behavior

## Steps to reproduce

## Environment

- Node version:
- Deployment: local / Docker / RunPod
- Platform: X / Facebook
- Browser backend: Playwright / Dolphin

## Logs

Remove API keys, cookies, tokens, and profile data before posting.
```

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature request
about: Suggest an improvement
title: "[Feature]: "
labels: enhancement
assignees: ""
---

## Use case

## Proposed behavior

## Alternatives considered

## Compatibility impact
```

Create `.github/pull_request_template.md`:

```markdown
## Summary

## Compatibility

- [ ] Existing endpoints remain compatible
- [ ] API/documentation changes are documented

## Verification

- [ ] `npm test`
- [ ] Manual smoke test, if relevant

## Security

- [ ] No secrets, cookies, profile data, or debug artifacts committed
```

- [ ] **Step 6: Run docs quality checks**

Run:

```bash
rg -n "sk-|auth_token|ct0|DOLPHIN_API_TOKEN=.*[^e]" README.md .env.example CONTRIBUTING.md SECURITY.md .github
```

Expected: no real secrets. Placeholder examples are allowed only when clearly fake.

- [ ] **Step 7: Commit OSS docs**

```bash
git add README.md .env.example CONTRIBUTING.md SECURITY.md .github
git commit -m "Prepare contributor-facing open source documentation" -m "Constraint: README must focus on the five supported AI social automation use cases.
Confidence: high
Scope-risk: moderate
Tested: secret-pattern documentation scan
Not-tested: Fresh-clone setup by a new contributor."
```

---

## Task 8: Final Verification and Release Readiness Check

**Files:**
- Modify if needed: `API_REFERENCES.md`, `README.md`

- [ ] **Step 1: Run full automated tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run import smoke checks**

Run:

```bash
node -e "require('./server'); require('./src/app'); console.log('load ok')"
```

Expected: prints `load ok`.

- [ ] **Step 3: Run health smoke check**

Start the server in one terminal:

```bash
PORT=3099 API_SECRET=test-secret DATA_DIR=/tmp/avatar-browser-test npm start
```

In another terminal:

```bash
curl -s http://localhost:3099/health
```

Expected response shape:

```json
{"status":"ok","timestamp":"2026-05-11T00:00:00.000Z"}
```

Stop the server after the check.

- [ ] **Step 4: Confirm branch diff is scoped**

Run:

```bash
git diff --stat main...HEAD
```

Expected: changes limited to the implementation plan scope: HTTP extraction, service extraction, tests, docs, and templates.

- [ ] **Step 5: Commit final doc/API polish if needed**

If `API_REFERENCES.md` or README endpoint examples need response wording updates, commit:

```bash
git add README.md API_REFERENCES.md
git commit -m "Document refactored API behavior for OSS release" -m "Constraint: Document only behavior that exists after refactor.
Confidence: high
Scope-risk: narrow
Tested: npm test; health smoke check
Not-tested: Live X/Facebook browser workflows."
```

---

## Self-Review

Spec coverage:
- Boundary-first refactor: Tasks 2-6.
- Shared execution flow: Task 3.
- Route/handler/middleware split: Task 4.
- Thin `server.js`: Task 5.
- Redundancy removal: Task 6.
- OSS README/docs/templates/env: Task 7.
- Verification: Tasks 1, 2, 3, 4, 5, 6, and 8.

Placeholder scan:
- No forbidden placeholder markers are intentionally present.
- Every code-changing task includes exact file paths and concrete code blocks.

Type/signature consistency:
- `createProfileService()` exports `ensureProfile`, `parseProfileId`, `ensureProfileById`, `saveCookies`, `readCookiesSummary`, and `markCookiesImported`.
- `createAutomationService()` exports `runPost`, `runReply`, and `runScrape`.
- `createApp()` accepts optional injected `automationService` and `profileService` for tests.
