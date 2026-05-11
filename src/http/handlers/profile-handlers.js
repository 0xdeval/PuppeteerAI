'use strict';

const profiles = require('../../profiles');
const { profileService: defaultProfileService } = require('../../services/profile-service');

function createProfileHandlers(options = {}) {
  const profileService = options.profileService || defaultProfileService;
  const getAllProfiles = options.getAllProfiles || profiles.getAllProfiles;
  const deleteProfile = options.deleteProfile || profiles.deleteProfile;

  function listProfiles(req, res) {
    const allProfiles = getAllProfiles();
    res.json({ profiles: allProfiles });
  }

  function deleteProfileById(req, res) {
    const { profileId } = req.params;

    try {
      deleteProfile(profileId);
      res.json({ success: true, profileId });
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  }

  function importCookies(req, res) {
    const { profileId } = req.params;
    const { cookies } = req.body;

    if (!Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ error: '`cookies` must be a non-empty array.' });
    }

    try {
      profileService.ensureProfileById(profileId);
      profileService.saveCookies(profileId, cookies);

      const { proxy, dolphin_profile_id } = req.body;
      profileService.markCookiesImported(profileId, {
        proxy,
        dolphinProfileId: dolphin_profile_id,
      });

      res.json({
        status: 'ready',
        profileId,
        cookiesImported: cookies.length,
        dolphinProfileId: dolphin_profile_id || null,
        message: 'Cookies saved. Profile is ready for posting.',
      });
    } catch (err) {
      if (err.message.includes('profileId must be in format')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  }

  function getCookies(req, res) {
    const { profileId } = req.params;

    try {
      const summary = profileService.readCookiesSummary(profileId);
      if (!summary) {
        return res.status(404).json({ error: 'No cookies file found for this profile.' });
      }

      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  return {
    listProfiles,
    deleteProfileById,
    importCookies,
    getCookies,
  };
}

module.exports = {
  createProfileHandlers,
};
