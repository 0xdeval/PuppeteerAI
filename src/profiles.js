'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const REGISTRY_PATH = path.join(DATA_DIR, 'registry.json');

const RATE_LIMIT_MIN_INTERVAL = parseInt(process.env.RATE_LIMIT_MIN_INTERVAL || '60', 10); // seconds
const RATE_LIMIT_DAILY_MAX = parseInt(process.env.RATE_LIMIT_DAILY_MAX || '20', 10);

// ─── Registry I/O ─────────────────────────────────────────────────────────────

function loadRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { profiles: {} };
  }
}

function saveRegistry(registry) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Returns a profile object by its ID, or null if not found.
 * @param {string} profileId
 * @returns {object|null}
 */
function getProfile(profileId) {
  const registry = loadRegistry();
  return registry.profiles[profileId] || null;
}

/**
 * Creates a new profile and persists it. Throws if the profile already exists.
 * @param {string} profileId
 * @param {{ platform: string, avatar: string, [key: string]: any }} data
 * @returns {object} The created profile.
 */
function createProfile(profileId, data) {
  const registry = loadRegistry();
  if (registry.profiles[profileId]) {
    throw new Error(`Profile '${profileId}' already exists.`);
  }

  const profile = {
    id: profileId,
    platform: data.platform,
    avatar: data.avatar,
    status: 'needs_login',
    createdAt: new Date().toISOString(),
    lastUsed: null,
    postHistory: [],       // [{ timestamp, postId }]
    dailyCounts: {},       // { "YYYY-MM-DD": count }
    ...data,
  };

  registry.profiles[profileId] = profile;
  saveRegistry(registry);
  return profile;
}

/**
 * Merges partial updates into a profile and saves.
 * @param {string} profileId
 * @param {object} updates
 * @returns {object} Updated profile.
 */
function updateProfile(profileId, updates) {
  const registry = loadRegistry();
  if (!registry.profiles[profileId]) {
    throw new Error(`Profile '${profileId}' not found.`);
  }
  registry.profiles[profileId] = { ...registry.profiles[profileId], ...updates };
  saveRegistry(registry);
  return registry.profiles[profileId];
}

/**
 * Deletes a profile from the registry.
 * @param {string} profileId
 */
function deleteProfile(profileId) {
  const registry = loadRegistry();
  if (!registry.profiles[profileId]) {
    throw new Error(`Profile '${profileId}' not found.`);
  }
  delete registry.profiles[profileId];
  saveRegistry(registry);
}

/**
 * Returns all profiles as an array.
 * @returns {object[]}
 */
function getAllProfiles() {
  const registry = loadRegistry();
  return Object.values(registry.profiles);
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Today's date key in YYYY-MM-DD format (UTC).
 */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Checks whether the avatar+platform is within rate limits.
 * @param {string} profileId
 * @returns {{ allowed: boolean, reason?: string, retryAfter?: number }}
 */
function checkRateLimit(profileId) {
  const profile = getProfile(profileId);
  if (!profile) {
    return { allowed: false, reason: 'Profile not found.' };
  }

  const now = Date.now();
  const today = todayKey();

  // Check minimum interval since last post
  if (profile.lastUsed) {
    const lastMs = new Date(profile.lastUsed).getTime();
    const elapsedSec = (now - lastMs) / 1000;
    if (elapsedSec < RATE_LIMIT_MIN_INTERVAL) {
      const retryAfter = Math.ceil(RATE_LIMIT_MIN_INTERVAL - elapsedSec);
      return {
        allowed: false,
        reason: `Rate limit: minimum interval of ${RATE_LIMIT_MIN_INTERVAL}s not elapsed. Wait ${retryAfter}s.`,
        retryAfter,
      };
    }
  }

  // Check daily maximum
  const dailyCounts = profile.dailyCounts || {};
  const todayCount = dailyCounts[today] || 0;
  if (todayCount >= RATE_LIMIT_DAILY_MAX) {
    return {
      allowed: false,
      reason: `Rate limit: daily maximum of ${RATE_LIMIT_DAILY_MAX} posts reached.`,
      retryAfter: secondsUntilTomorrow(),
    };
  }

  return { allowed: true };
}

function secondsUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return Math.ceil((tomorrow - now) / 1000);
}

/**
 * Records a successful post: updates lastUsed and increments daily counter.
 * @param {string} profileId
 * @param {{ postId?: string }} [meta]
 */
function recordPost(profileId, meta = {}) {
  const registry = loadRegistry();
  const profile = registry.profiles[profileId];
  if (!profile) return;

  const now = new Date().toISOString();
  const today = todayKey();

  profile.lastUsed = now;
  profile.postHistory = profile.postHistory || [];
  profile.postHistory.push({ timestamp: now, ...(meta.postId ? { postId: meta.postId } : {}) });

  // Keep only last 100 posts in history
  if (profile.postHistory.length > 100) {
    profile.postHistory = profile.postHistory.slice(-100);
  }

  profile.dailyCounts = profile.dailyCounts || {};
  profile.dailyCounts[today] = (profile.dailyCounts[today] || 0) + 1;

  // Prune old daily counts (keep last 30 days)
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  for (const key of Object.keys(profile.dailyCounts)) {
    if (new Date(key) < cutoff) {
      delete profile.dailyCounts[key];
    }
  }

  saveRegistry(registry);
}

// ─── Profile directory helpers ────────────────────────────────────────────────

/**
 * Returns the filesystem path to a profile's browser data directory.
 * @param {string} profileId
 * @returns {string}
 */
function profileDir(profileId) {
  return path.join(DATA_DIR, 'profiles', profileId);
}

module.exports = {
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  getAllProfiles,
  checkRateLimit,
  recordPost,
  profileDir,
};
