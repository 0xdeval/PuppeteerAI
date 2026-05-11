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
