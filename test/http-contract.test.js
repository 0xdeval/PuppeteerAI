'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/app');

async function request(server, method, path, body, apiKey = 'secret') {
  const address = server.address();
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path,
      headers: {
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        ...(payload ? {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        } : {}),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsedBody = null;
        if (raw) {
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            parsedBody = raw;
          }
        }
        resolve({
          statusCode: res.statusCode,
          body: parsedBody,
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /health does not require auth', async () => {
  const app = createApp({ apiSecret: 'secret' });

  await withServer(app, async (server) => {
    const res = await request(server, 'GET', '/health', null, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
  });
});

test('POST /post validates required fields before service call', async () => {
  let runPostCalls = 0;
  const app = createApp({
    apiSecret: 'secret',
    automationService: {
      runPost: async () => {
        runPostCalls += 1;
        throw new Error('runPost should not be called when fields are missing');
      },
    },
  });

  await withServer(app, async (server) => {
    const res = await request(server, 'POST', '/post', { platform: 'x' });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /platform, avatar, and text are required/);
    assert.equal(runPostCalls, 0);
  });
});

test('POST /reply delegates valid request and returns service result', async () => {
  let runReplyArgs;
  const app = createApp({
    apiSecret: 'secret',
    automationService: {
      runReply: async (args) => {
        runReplyArgs = args;
        return {
          httpStatus: 200,
          body: { success: true, post_url: 'https://x.com/p/1', profileId: 'x-alice' },
        };
      },
    },
  });

  await withServer(app, async (server) => {
    const res = await request(server, 'POST', '/reply', {
      platform: 'x',
      avatar: 'alice',
      post_url: 'https://x.com/post/1',
      text: 'reply',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(runReplyArgs.platform, 'x');
    assert.equal(runReplyArgs.avatar, 'alice');
    assert.equal(runReplyArgs.post_url, 'https://x.com/post/1');
    assert.equal(runReplyArgs.text, 'reply');
  });
});
