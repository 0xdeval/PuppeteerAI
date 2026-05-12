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

test('parseProfileId rejects non-string and empty ids', () => {
  const service = createProfileService();

  assert.throws(() => service.parseProfileId(), /profileId must be in format/);
  assert.throws(() => service.parseProfileId(null), /profileId must be in format/);
  assert.throws(() => service.parseProfileId(12), /profileId must be in format/);
  assert.throws(() => service.parseProfileId(''), /profileId must be in format/);
  assert.throws(() => service.parseProfileId('   '), /profileId must be in format/);
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

test('ensureProfileById preserves dashed avatars and creates when missing', () => {
  const calls = [];
  const service = createProfileService({
    getProfile: () => null,
    createProfile: (profileId, data) => {
      calls.push({ profileId, data });
      return { id: profileId, ...data };
    },
  });

  const result = service.ensureProfileById('x-john-firemool');

  assert.equal(result.profileId, 'x-john-firemool');
  assert.equal(result.platform, 'x');
  assert.equal(result.avatar, 'john-firemool');
  assert.equal(result.profile.status, 'needs_login');
  assert.deepEqual(calls, [{
    profileId: 'x-john-firemool',
    data: { platform: 'x', avatar: 'john-firemool', status: 'needs_login' },
  }]);
});

test('readCookiesSummary returns null when cookies file is missing', () => {
  const service = createProfileService({
    profileDir: () => '/tmp/profile',
    fs: {
      existsSync: () => false,
    },
  });

  assert.equal(service.readCookiesSummary('x-alice'), null);
});

test('readCookiesSummary throws scoped errors for malformed and non-array cookie data', () => {
  const serviceWithMalformedJson = createProfileService({
    profileDir: () => '/tmp/profile',
    fs: {
      existsSync: () => true,
      readFileSync: () => '{ bad json',
    },
  });
  assert.throws(
    () => serviceWithMalformedJson.readCookiesSummary('x-alice'),
    /Invalid cookies file for x-alice:/
  );

  const serviceWithObjectJson = createProfileService({
    profileDir: () => '/tmp/profile',
    fs: {
      existsSync: () => true,
      readFileSync: () => '{"name":"cookie"}',
    },
  });
  assert.throws(
    () => serviceWithObjectJson.readCookiesSummary('x-alice'),
    /Invalid cookies file for x-alice: expected a JSON array/
  );
});

test('saveCookies uses injected fs and markCookiesImported maps optional fields', () => {
  const writes = [];
  const updates = [];
  const service = createProfileService({
    profileDir: () => '/tmp/profile',
    fs: {
      mkdirSync: (...args) => writes.push({ op: 'mkdir', args }),
      writeFileSync: (...args) => writes.push({ op: 'write', args }),
    },
    updateProfile: (profileId, data) => {
      updates.push({ profileId, data });
      return { profileId, ...data };
    },
  });

  const cookiesPath = service.saveCookies('x-alice', [{ name: 'sid', value: 'abc' }]);
  assert.equal(cookiesPath, '/tmp/profile/cookies.json');
  assert.equal(writes[0].op, 'mkdir');
  assert.deepEqual(writes[0].args, ['/tmp/profile', { recursive: true }]);
  assert.equal(writes[1].op, 'write');
  assert.equal(writes[1].args[0], '/tmp/profile/cookies.json');
  assert.equal(writes[1].args[2], 'utf8');

  const result = service.markCookiesImported('x-alice', {
    proxy: 'http://proxy.local',
    dolphinProfileId: 'dp-123',
  });

  assert.equal(result.profileId, 'x-alice');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].profileId, 'x-alice');
  assert.equal(updates[0].data.status, 'ready');
  assert.equal(typeof updates[0].data.lastLoginAt, 'string');
  assert.equal(updates[0].data.proxy, 'http://proxy.local');
  assert.equal(updates[0].data.dolphinProfileId, 'dp-123');
});
