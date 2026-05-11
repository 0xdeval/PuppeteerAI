'use strict';

const { postContent } = require('../../tasks/post');
const { replyToPost } = require('../../tasks/reply');
const { scrapeProfilePosts } = require('../../tasks/scrape');
const { downloadImage, cleanupTempFile } = require('../../utils');
const { automationService: defaultAutomationService } = require('../../services/automation-service');

function createAutomationHandlers(options = {}) {
  const automationService = options.automationService || defaultAutomationService;
  const downloadImageImpl = options.downloadImage || downloadImage;
  const cleanupTempFileImpl = options.cleanupTempFile || cleanupTempFile;

  async function post(req, res, next) {
    const { platform, avatar, text, image_url } = req.body;

    if (!platform || !avatar || !text) {
      return res.status(400).json({ error: 'platform, avatar, and text are required.' });
    }

    let imagePath = null;

    try {
      if (image_url) {
        try {
          imagePath = await downloadImageImpl(image_url);
        } catch (imgErr) {
          return res.status(400).json({ error: `Failed to download image: ${imgErr.message}` });
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
    } catch (err) {
      console.error('[server] /post error:', err);
      return next(err);
    } finally {
      await cleanupTempFileImpl(imagePath);
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
    } catch (err) {
      console.error('[server] /reply error:', err);
      return next(err);
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
    } catch (err) {
      console.error('[server] /scrape error:', err);
      return next(err);
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
