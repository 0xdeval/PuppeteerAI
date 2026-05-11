'use strict';

require('dotenv').config();

const { createApp } = require('./src/app');
const { cleanupOldTempFiles } = require('./src/utils');

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = createApp();

if (require.main === module) {
  cleanupOldTempFiles().catch((err) =>
    console.warn('[server] Startup temp cleanup failed:', err.message)
  );

  app.listen(PORT, () => {
    console.log(`[server] Avatar Browser Service listening on port ${PORT}`);
    console.log(`[server] LLM provider: ${process.env.LLM_PROVIDER || 'anthropic'}`);
    console.log(`[server] Data dir: ${process.env.DATA_DIR || './data'}`);
  });
}

module.exports = app;
