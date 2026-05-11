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
  const profileIdFormatError =
    'profileId must be in format {platform}-{avatar}, e.g. x-john-firemool';

  function getOrCreateProfile(profileId, platform, avatar) {
    let profile = getProfile(profileId);
    if (!profile) {
      profile = createProfile(profileId, { platform, avatar, status: 'needs_login' });
    }
    return profile;
  }

  function ensureProfile(platform, avatar) {
    const profileId = makeProfileId(platform, avatar);
    const profile = getOrCreateProfile(profileId, platform, avatar);
    return { profile, profileId };
  }

  function parseProfileId(profileId) {
    if (typeof profileId !== 'string' || profileId.trim().length === 0) {
      throw new Error(profileIdFormatError);
    }

    const firstDash = profileId.indexOf('-');
    const platform = firstDash !== -1 ? profileId.slice(0, firstDash) : '';
    const avatar = firstDash !== -1 ? profileId.slice(firstDash + 1) : '';

    if (!platform || !avatar) {
      throw new Error(profileIdFormatError);
    }

    return { platform, avatar };
  }

  function ensureProfileById(profileId) {
    const { platform, avatar } = parseProfileId(profileId);
    const profile = getOrCreateProfile(profileId, platform, avatar);
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

    let cookies;
    try {
      cookies = JSON.parse(fsImpl.readFileSync(cookiesPath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid cookies file for ${profileId}: ${error.message}`);
    }

    if (!Array.isArray(cookies)) {
      throw new Error(`Invalid cookies file for ${profileId}: expected a JSON array`);
    }

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
