'use strict';

const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');

const { createApp } = require('../src/app');

async function request(app, method, path, body, apiKey = 'secret') {
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = new Readable({
      read() {
        if (payload) this.push(payload);
        this.push(null);
      },
    });
    req.method = method;
    req.url = path;
    req.headers = {
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...(payload ? {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
      } : {}),
    };

    const chunks = [];
    const headers = {};
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      getHeader(name) {
        return headers[name.toLowerCase()];
      },
      removeHeader(name) {
        delete headers[name.toLowerCase()];
      },
      writeHead(statusCode, responseHeaders = {}) {
        this.statusCode = statusCode;
        Object.entries(responseHeaders).forEach(([name, value]) => this.setHeader(name, value));
        this.headersSent = true;
      },
      write(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
      end(chunk) {
        if (chunk) this.write(chunk);
        this.headersSent = true;
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsedBody = null;
        if (raw) {
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            parsedBody = raw;
          }
        }
        resolve({
          statusCode: this.statusCode,
          body: parsedBody,
        });
      },
    };

    app.handle(req, res, reject);
  });
}

test('GET /health does not require auth', async () => {
  const app = createApp({ apiSecret: 'secret' });

  const res = await request(app, 'GET', '/health', null, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
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

  const res = await request(app, 'POST', '/post', { platform: 'x' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /platform, avatar, and text are required/);
  assert.equal(runPostCalls, 0);
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

  const res = await request(app, 'POST', '/reply', {
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
