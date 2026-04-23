'use strict';

const DOLPHIN_API_URL = (process.env.DOLPHIN_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function startDolphinProfile(dolphinProfileId) {
  const url = `${DOLPHIN_API_URL}/v1.0/browser_profiles/${dolphinProfileId}/start?automation=1`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Dolphin unreachable at ${DOLPHIN_API_URL}: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Dolphin start failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  if (!data.automation?.wsEndpoint) {
    throw new Error(`Dolphin start returned no wsEndpoint: ${JSON.stringify(data)}`);
  }
  return { wsEndpoint: data.automation.wsEndpoint };
}

async function stopDolphinProfile(dolphinProfileId) {
  const url = `${DOLPHIN_API_URL}/v1.0/browser_profiles/${dolphinProfileId}/stop`;
  try {
    await fetch(url);
  } catch {
    // best-effort stop — don't throw
  }
}

module.exports = { startDolphinProfile, stopDolphinProfile };
