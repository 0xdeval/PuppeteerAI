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
