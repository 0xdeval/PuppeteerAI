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
      return await runBrowser(profileId, { platform }, async (browser, page) =>
        task(browser, page)
      );
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
