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

test('runPost records post id on posted result', async () => {
  const calls = [];
  const service = makeService({
    recordPost: (profileId, payload) => calls.push([profileId, payload]),
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'posted', post_url: 'https://x.com/p/1' }),
  });

  assert.equal(result.httpStatus, 200);
  assert.deepEqual(calls, [['x-alice', { postId: 'https://x.com/p/1' }]]);
});

test('runReply records post id on posted result', async () => {
  const calls = [];
  const service = makeService({
    recordPost: (profileId, payload) => calls.push([profileId, payload]),
  });

  const result = await service.runReply({
    platform: 'x',
    avatar: 'alice',
    post_url: 'https://x.com/p/1',
    text: 'reply',
    replyToPost: async () => ({ status: 'posted', post_url: 'https://x.com/p/2' }),
  });

  assert.equal(result.httpStatus, 200);
  assert.deepEqual(calls, [['x-alice', { postId: 'https://x.com/p/2' }]]);
});

test('runPost login_expired updates profile and returns relogin response', async () => {
  const calls = [];
  const service = makeService({
    updateProfile: (profileId, payload) => calls.push([profileId, payload]),
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'login_expired', error: 'Session expired.' }),
  });

  assert.equal(result.httpStatus, 403);
  assert.equal(result.body.needs_relogin, true);
  assert.deepEqual(calls, [['x-alice', { status: 'login_expired' }]]);
});

test('runReply login_expired updates profile and returns relogin response', async () => {
  const calls = [];
  const service = makeService({
    updateProfile: (profileId, payload) => calls.push([profileId, payload]),
  });

  const result = await service.runReply({
    platform: 'x',
    avatar: 'alice',
    post_url: 'https://x.com/p/1',
    text: 'reply',
    replyToPost: async () => ({ status: 'login_expired', error: 'Session expired.' }),
  });

  assert.equal(result.httpStatus, 403);
  assert.equal(result.body.needs_relogin, true);
  assert.deepEqual(calls, [['x-alice', { status: 'login_expired' }]]);
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

test('runPost maps browser timeout to 504', async () => {
  const service = makeService({
    getBrowserForProfile: async () => {
      throw Object.assign(new Error('timeout'), { code: 'BROWSER_TIMEOUT' });
    },
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'posted', post_url: 'https://x.com/p/1' }),
  });

  assert.equal(result.httpStatus, 504);
  assert.equal(result.body.error, 'Browser task timed out.');
});

test('unknown browser errors propagate for runPost', async () => {
  const err = new Error('unexpected browser failure');
  const service = makeService({
    getBrowserForProfile: async () => {
      throw err;
    },
  });

  await assert.rejects(
    service.runPost({
      platform: 'x',
      avatar: 'alice',
      text: 'hello',
      postContent: async () => ({ status: 'posted', post_url: 'https://x.com/p/1' }),
    }),
    err
  );
});

test('long rate limit returns 429 without sleep or browser usage', async () => {
  let sleepCalls = 0;
  let browserCalls = 0;
  const service = makeService({
    checkRateLimit: () => ({ allowed: false, retryAfter: 121, reason: 'rate limited' }),
    sleep: async () => {
      sleepCalls += 1;
    },
    getBrowserForProfile: async () => {
      browserCalls += 1;
      return {};
    },
  });

  const result = await service.runPost({
    platform: 'x',
    avatar: 'alice',
    text: 'hello',
    postContent: async () => ({ status: 'posted', post_url: 'https://x.com/p/1' }),
  });

  assert.equal(result.httpStatus, 429);
  assert.equal(sleepCalls, 0);
  assert.equal(browserCalls, 0);
});

test('scrape success returns posts and profile id', async () => {
  const service = makeService();

  const result = await service.runScrape({
    platform: 'facebook',
    avatar: 'alice',
    profile_url: 'https://facebook.com/alice',
    limit: 2,
    scrapeProfilePosts: async () => ({
      status: 'ok',
      posts: [{ id: 1 }, { id: 2 }],
    }),
  });

  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.body.posts, [{ id: 1 }, { id: 2 }]);
  assert.equal(result.body.profileId, 'x-alice');
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

test('scrape unknown status without error returns fallback message', async () => {
  const service = makeService();

  const result = await service.runScrape({
    platform: 'facebook',
    avatar: 'alice',
    profile_url: 'https://facebook.com/alice',
    limit: null,
    scrapeProfilePosts: async () => ({
      status: 'weird',
    }),
  });

  assert.equal(result.httpStatus, 500);
  assert.equal(result.body.error, 'Scrape failed for unknown reason.');
});
