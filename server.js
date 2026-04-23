'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const { getBrowserForProfile } = require('./src/browser');
const {
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile: deleteProfileRecord,
  getAllProfiles,
  checkRateLimit,
  recordPost,
} = require('./src/profiles');
const { postContent } = require('./src/tasks/post');
const { replyToPost } = require('./src/tasks/reply');
const { scrapeProfilePosts } = require('./src/tasks/scrape');
const {
  generateProfileId,
  downloadImage,
  cleanupTempFile,
  cleanupOldTempFiles,
} = require('./src/utils');

const PORT = parseInt(process.env.PORT || '3001', 10);
const API_SECRET = process.env.API_SECRET;

const app = express();
app.use(express.json({ limit: '10mb' }));

// Match response timeout to MAX_BROWSER_TIMEOUT so slow Ollama inference + typing never
// causes the socket to close before the browser task finishes.
const HTTP_TIMEOUT_MS = parseInt(process.env.MAX_BROWSER_TIMEOUT || '600', 10) * 1000;
app.use((req, res, next) => {
  res.setTimeout(HTTP_TIMEOUT_MS);
  next();
});

// ─── Startup cleanup ──────────────────────────────────────────────────────────

cleanupOldTempFiles().catch((err) =>
  console.warn('[server] Startup temp cleanup failed:', err.message)
);

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!API_SECRET) {
    return res.status(500).json({ error: 'API_SECRET not configured on server.' });
  }
  const key = req.headers['x-api-key'];
  if (!key || key !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header.' });
  }
  next();
}

// Like requireAuth but also accepts ?key= query param (for browser-friendly debug routes)
function requireAuthOrQuery(req, res, next) {
  if (!API_SECRET) {
    return res.status(500).json({ error: 'API_SECRET not configured on server.' });
  }
  const key = req.headers['x-api-key'] || req.query.key;
  if (!key || key !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header or ?key= query param.' });
  }
  next();
}

// ─── Helper: sleep ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helper: build or retrieve profile ───────────────────────────────────────

/**
 * Ensures a profile exists for the given avatar+platform pair.
 * Creates one if it doesn't exist (status: needs_login).
 * Returns { profile, profileId }.
 */
function ensureProfile(platform, avatar) {
  const profileId = generateProfileId(platform, avatar);
  let profile = getProfile(profileId);
  if (!profile) {
    profile = createProfile(profileId, { platform, avatar, status: 'needs_login' });
  }
  return { profile, profileId };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /profiles
app.get('/profiles', requireAuth, (req, res) => {
  const profiles = getAllProfiles();
  res.json({ profiles });
});

// DELETE /profiles/:profileId
app.delete('/profiles/:profileId', requireAuth, async (req, res) => {
  const { profileId } = req.params;
  try {
    deleteProfileRecord(profileId);
    res.json({ success: true, profileId });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /post
app.post('/post', requireAuth, async (req, res) => {
  const { platform, avatar, text, image_url } = req.body;

  if (!platform || !avatar || !text) {
    return res.status(400).json({ error: 'platform, avatar, and text are required.' });
  }

  const { profile, profileId } = ensureProfile(platform, avatar);

  if (profile.status === 'needs_login') {
    return res.status(403).json({
      error: 'Profile needs login before posting.',
      needs_relogin: true,
      profileId,
    });
  }

  const rateCheck = checkRateLimit(profileId);
  if (!rateCheck.allowed) {
    if (rateCheck.retryAfter && rateCheck.retryAfter <= 120) {
      console.log(`[server] /post rate-limited for ${profileId}, waiting ${rateCheck.retryAfter}s before proceeding`);
      await sleep(rateCheck.retryAfter * 1000);
    } else {
      return res.status(429).json({ error: rateCheck.reason, retryAfter: rateCheck.retryAfter });
    }
  }

  let imagePath = null;

  try {
    if (image_url) {
      try {
        imagePath = await downloadImage(image_url);
      } catch (imgErr) {
        return res.status(400).json({ error: `Failed to download image: ${imgErr.message}` });
      }
    }

    let result;
    try {
      result = await getBrowserForProfile(profileId, { platform }, async (browser, page) => {
        return await postContent(page, { platform, text, imagePath, avatar }, null);
      });
    } catch (browserErr) {
      if (browserErr.code === 'PROFILE_BUSY') {
        return res.status(429).json({ error: browserErr.message, retryAfter: 30 });
      }
      if (browserErr.code === 'BROWSER_TIMEOUT') {
        return res.status(504).json({ error: 'Browser task timed out.' });
      }
      throw browserErr;
    }

    if (result.status === 'posted') {
      recordPost(profileId, { postId: result.post_url });
      return res.json({ success: true, post_url: result.post_url, profileId });
    }

    if (result.status === 'login_expired') {
      updateProfile(profileId, { status: 'login_expired' });
      return res.status(403).json({
        error: result.error || 'Session expired.',
        needs_relogin: true,
        profileId,
      });
    }

    return res.status(500).json({ error: result.error || 'Post failed for unknown reason.' });
  } finally {
    await cleanupTempFile(imagePath);
  }
});

// POST /reply
app.post('/reply', requireAuth, async (req, res) => {
  const { platform, avatar, post_url, text } = req.body;

  if (!platform || !avatar || !post_url || !text) {
    return res.status(400).json({ error: 'platform, avatar, post_url, and text are required.' });
  }

  const { profile, profileId } = ensureProfile(platform, avatar);

  if (profile.status === 'needs_login') {
    return res.status(403).json({
      error: 'Profile needs login before replying.',
      needs_relogin: true,
      profileId,
    });
  }

  const rateCheck = checkRateLimit(profileId);
  if (!rateCheck.allowed) {
    if (rateCheck.retryAfter && rateCheck.retryAfter <= 120) {
      // Wait out the interval rather than rejecting — avoids n8n having to retry
      console.log(`[server] /reply rate-limited for ${profileId}, waiting ${rateCheck.retryAfter}s before proceeding`);
      await sleep(rateCheck.retryAfter * 1000);
    } else {
      return res.status(429).json({ error: rateCheck.reason, retryAfter: rateCheck.retryAfter });
    }
  }

  try {
    let result;
    try {
      result = await getBrowserForProfile(profileId, { platform }, async (browser, page) => {
        return await replyToPost(page, { platform, post_url, text, avatar }, null);
      });
    } catch (browserErr) {
      if (browserErr.code === 'PROFILE_BUSY') {
        return res.status(429).json({ error: browserErr.message, retryAfter: 30 });
      }
      if (browserErr.code === 'BROWSER_TIMEOUT') {
        return res.status(504).json({ error: 'Browser task timed out.' });
      }
      throw browserErr;
    }

    if (result.status === 'posted') {
      recordPost(profileId, { postId: result.post_url });
      return res.json({ success: true, post_url: result.post_url, profileId });
    }

    if (result.status === 'login_expired') {
      updateProfile(profileId, { status: 'login_expired' });
      return res.status(403).json({
        error: result.error || 'Session expired.',
        needs_relogin: true,
        profileId,
      });
    }

    return res.status(500).json({ error: result.error || 'Reply failed for unknown reason.' });
  } catch (err) {
    console.error('[server] /reply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /scrape
// Navigates to a Facebook profile URL and returns all posts visible in the DOM
// at that moment (no scrolling). Call repeatedly after scrolling to paginate.
app.post('/scrape', requireAuth, async (req, res) => {
  const { platform, avatar, profile_url, limit } = req.body;

  if (!platform || !avatar || !profile_url) {
    return res.status(400).json({ error: 'platform, avatar, and profile_url are required.' });
  }

  const postLimit = limit != null ? parseInt(limit, 10) : null;
  if (postLimit !== null && (isNaN(postLimit) || postLimit < 1)) {
    return res.status(400).json({ error: 'limit must be a positive integer.' });
  }

  const { profileId } = ensureProfile(platform, avatar);

  try {
    let result;

    try {
      result = await getBrowserForProfile(profileId, { platform }, async (browser, page) => {
        return await scrapeProfilePosts(page, { profile_url, avatar, limit: postLimit });
      });
    } catch (browserErr) {
      if (browserErr.code === 'PROFILE_BUSY') {
        return res.status(429).json({ error: browserErr.message, retryAfter: 30 });
      }
      if (browserErr.code === 'BROWSER_TIMEOUT') {
        return res.status(504).json({ error: 'Browser task timed out.' });
      }
      throw browserErr;
    }

    if (result.status === 'ok') {
      return res.json({ success: true, posts: result.posts, profileId });
    }

    if (result.status === 'login_required') {
      return res.status(403).json({
        error: result.error || 'Facebook requires login to view this page.',
        needs_relogin: true,
        profileId,
      });
    }

    return res.status(500).json({ error: result.error || 'Scrape failed for unknown reason.' });
  } catch (err) {
    console.error('[server] /scrape error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /profiles/:profileId/cookies
// Import cookies exported from a real browser (via Cookie-Editor extension).
// This is the recommended way to authenticate — bypasses bot detection on login pages entirely.
app.post('/profiles/:profileId/cookies', requireAuth, async (req, res) => {
  const { profileId } = req.params;
  const { cookies } = req.body;

  if (!Array.isArray(cookies) || cookies.length === 0) {
    return res.status(400).json({ error: '`cookies` must be a non-empty array.' });
  }

  // Create profile if it doesn't exist yet
  const firstDash = profileId.indexOf('-');
  const platform = firstDash !== -1 ? profileId.slice(0, firstDash) : undefined;
  const avatar = firstDash !== -1 ? profileId.slice(firstDash + 1) : undefined;

  if (!platform || !avatar) {
    return res.status(400).json({ error: 'profileId must be in format {platform}-{avatar}, e.g. x-john-firemool' });
  }

  let profile = getProfile(profileId);
  if (!profile) {
    profile = createProfile(profileId, { platform, avatar, status: 'needs_login' });
  }

  try {
    // Save cookies to a file in the profile directory so they survive across sessions.
    // browser.addCookies() only lives in-memory and is unreliable across context restarts.
    const { profileDir } = require('./src/profiles');
    const cookiesPath = path.join(profileDir(profileId), 'cookies.json');
    fs.mkdirSync(profileDir(profileId), { recursive: true });
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2), 'utf8');

    const { proxy } = req.body;
    updateProfile(profileId, {
      status: 'ready',
      lastLoginAt: new Date().toISOString(),
      ...(proxy ? { proxy } : {}),
    });

    res.json({
      status: 'ready',
      profileId,
      cookiesImported: cookies.length,
      message: 'Cookies saved. Profile is ready for posting.',
    });
  } catch (err) {
    console.error('[server] /cookies import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /profiles/:profileId/cookies — show saved cookies (names only, not values)
app.get('/profiles/:profileId/cookies', requireAuth, (req, res) => {
  const { profileId } = req.params;
  const { profileDir } = require('./src/profiles');
  const cookiesPath = path.join(profileDir(profileId), 'cookies.json');
  if (!fs.existsSync(cookiesPath)) {
    return res.status(404).json({ error: 'No cookies file found for this profile.' });
  }
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    res.json({
      profileId,
      cookieCount: cookies.length,
      cookies: cookies.map(c => ({ name: c.name, domain: c.domain, path: c.path, hasValue: !!c.value, valueLength: c.value?.length })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /debug/:filename — serve debug screenshots (.png) and model response logs (.json)
app.get('/debug/:filename', requireAuthOrQuery, (req, res) => {
  const { filename } = req.params;

  // Allow .png and .json files; reject path traversal attempts
  if (!/^[\p{L}\p{N}\w\-.:]+\.(png|json)$/iu.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }

  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
  const filepath = path.join(DATA_DIR, 'debug', filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Debug file not found.' });
  }

  const isPng = filename.endsWith('.png');
  res.setHeader('Content-Type', isPng ? 'image/png' : 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filepath).pipe(res);
});

// GET /debug — list all saved debug files (screenshots + model response logs)
app.get('/debug', requireAuthOrQuery, (req, res) => {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
  const debugDir = path.join(DATA_DIR, 'debug');

  if (!fs.existsSync(debugDir)) {
    return res.json({ screenshots: [], logs: [] });
  }

  const all = fs.readdirSync(debugDir).sort().reverse(); // newest first

  const screenshots = all
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({ filename: f, url: `/debug/${encodeURIComponent(f)}` }));

  const logs = all
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ filename: f, url: `/debug/${encodeURIComponent(f)}` }));

  res.json({ screenshots, logs });
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Avatar Browser Service listening on port ${PORT}`);
  console.log(`[server] LLM provider: ${process.env.LLM_PROVIDER || 'anthropic'}`);
  console.log(`[server] Data dir: ${process.env.DATA_DIR || './data'}`);
});

module.exports = app;
