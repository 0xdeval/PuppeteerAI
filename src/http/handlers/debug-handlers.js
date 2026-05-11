'use strict';

const fs = require('fs');
const path = require('path');

function createDebugHandlers(options = {}) {
  const dataDir = options.dataDir || path.join(process.cwd(), 'data');
  const fsImpl = options.fs || fs;

  function listDebugFiles(req, res) {
    const debugDir = path.join(dataDir, 'debug');

    if (!fsImpl.existsSync(debugDir)) {
      return res.json({ screenshots: [], logs: [] });
    }

    const all = fsImpl.readdirSync(debugDir).sort().reverse();

    const screenshots = all
      .filter((filename) => filename.endsWith('.png'))
      .map((filename) => ({ filename, url: `/debug/${encodeURIComponent(filename)}` }));

    const logs = all
      .filter((filename) => filename.endsWith('.json'))
      .map((filename) => ({ filename, url: `/debug/${encodeURIComponent(filename)}` }));

    res.json({ screenshots, logs });
  }

  function getDebugFile(req, res) {
    const { filename } = req.params;

    if (!/^[\p{L}\p{N}\w\-.:]+\.(png|json)$/iu.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    const filepath = path.join(dataDir, 'debug', filename);

    if (!fsImpl.existsSync(filepath)) {
      return res.status(404).json({ error: 'Debug file not found.' });
    }

    const isPng = filename.endsWith('.png');
    res.setHeader('Content-Type', isPng ? 'image/png' : 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    fsImpl.createReadStream(filepath).pipe(res);
  }

  return {
    listDebugFiles,
    getDebugFile,
  };
}

module.exports = {
  createDebugHandlers,
};
