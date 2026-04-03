'use strict';

const { launchBrowser, closeBrowser } = require('./browser');
const { getProfile, createProfile, updateProfile } = require('./profiles');
const { generateProfileId } = require('./utils');

// Map of active login sessions: profileId → { browser, page, startTime, platform }
const activeSessions = new Map();

const PLATFORM_LOGIN_URLS = {
  twitter: 'https://twitter.com/login',
  x: 'https://x.com/login',
  facebook: 'https://www.facebook.com/login',
};

const VNC_HOST = process.env.VNC_HOST || '0.0.0.0';
const VNC_PORT = parseInt(process.env.VNC_PORT || '6080', 10);
const MAX_LOGIN_SESSION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Starts a manual login session for a profile.
 * Launches a HEADED (visible) browser, navigates to the platform login page,
 * and returns information the caller can use to connect via noVNC.
 *
 * Only one login session per profile is allowed at a time.
 *
 * @param {string} profileId
 * @param {object} [options]
 * @param {string} [options.platform]  - Required if profile doesn't exist yet.
 * @param {string} [options.avatar]    - Required if profile doesn't exist yet.
 * @returns {Promise<{ profileId, platform, vnc_url, message }>}
 */
async function startLoginSession(profileId, options = {}) {
  // Check for existing session
  if (activeSessions.has(profileId)) {
    const existing = activeSessions.get(profileId);
    const age = Date.now() - existing.startTime;
    if (age < MAX_LOGIN_SESSION_MS) {
      const vnc_url = buildVncUrl();
      return {
        profileId,
        platform: existing.platform,
        vnc_url,
        message: 'Login session already active. Connect via noVNC.',
        already_active: true,
      };
    }
    // Session expired — clean it up
    console.log(`[login] Cleaning up stale session for ${profileId}`);
    await cleanupSession(profileId);
  }

  // Ensure profile exists in registry
  let profile = getProfile(profileId);
  if (!profile) {
    if (!options.platform || !options.avatar) {
      throw Object.assign(
        new Error('Profile not found. Provide platform and avatar to create a new one.'),
        { code: 'PROFILE_NOT_FOUND' }
      );
    }
    profile = createProfile(profileId, {
      platform: options.platform,
      avatar: options.avatar,
      status: 'needs_login',
    });
  }

  const platform = options.platform || profile.platform;
  const loginUrl = PLATFORM_LOGIN_URLS[platform.toLowerCase()] || `https://${platform}.com/login`;

  console.log(`[login] Starting login session for ${profileId} on ${platform}`);

  // Launch headed browser (visible on Xvfb display, accessible via noVNC)
  const { browser, page } = await launchBrowser(profileId, { headless: false, platform });

  activeSessions.set(profileId, {
    browser,
    page,
    platform,
    startTime: Date.now(),
  });

  // Navigate to the login page
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    // Navigation errors are non-fatal; the user can navigate manually via VNC
    console.warn(`[login] Navigation to login page failed (${err.message}). User can navigate manually.`);
  }

  // Auto-expire session after MAX_LOGIN_SESSION_MS
  setTimeout(async () => {
    if (activeSessions.has(profileId)) {
      console.log(`[login] Auto-expiring login session for ${profileId}`);
      await cleanupSession(profileId);
    }
  }, MAX_LOGIN_SESSION_MS);

  const vnc_url = buildVncUrl();

  return {
    profileId,
    platform,
    vnc_url,
    login_url: loginUrl,
    message: `Browser opened. Connect to noVNC at ${vnc_url} and complete the login. Then call POST /login/${profileId}/complete.`,
  };
}

/**
 * Marks a manual login session as complete.
 * Closes the headed browser and updates the profile status to "ready".
 *
 * @param {string} profileId
 * @returns {Promise<{ profileId, status, message }>}
 */
async function completeLoginSession(profileId) {
  const session = activeSessions.get(profileId);
  if (!session) {
    throw Object.assign(
      new Error(`No active login session found for profile '${profileId}'.`),
      { code: 'NO_SESSION' }
    );
  }

  console.log(`[login] Completing login session for ${profileId}`);

  await cleanupSession(profileId);

  // Mark profile as ready
  updateProfile(profileId, {
    status: 'ready',
    lastLoginAt: new Date().toISOString(),
  });

  return {
    profileId,
    status: 'ready',
    message: 'Login session completed. Profile is now ready for posting.',
  };
}

/**
 * Closes the browser for a login session and removes it from the map.
 * @param {string} profileId
 */
async function cleanupSession(profileId) {
  const session = activeSessions.get(profileId);
  if (!session) return;

  activeSessions.delete(profileId);

  try {
    await closeBrowser(session.browser);
  } catch (err) {
    console.warn(`[login] Error closing browser for ${profileId}:`, err.message);
  }
}

/**
 * Returns the list of profiles with currently active login sessions.
 * @returns {string[]}
 */
function getActiveSessions() {
  return Array.from(activeSessions.keys());
}

/**
 * Builds the noVNC URL for the current environment.
 * @returns {string}
 */
function buildVncUrl() {
  return `http://${VNC_HOST === '0.0.0.0' ? 'localhost' : VNC_HOST}:${VNC_PORT}/vnc.html`;
}

module.exports = {
  startLoginSession,
  completeLoginSession,
  cleanupSession,
  getActiveSessions,
};
