const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const { publish } = require('../tools/publish-greasyfork.cjs');

const code = '// ==UserScript==\n// @version 0.1.2\n// ==/UserScript==\nconsole.log("test");\n';
const scriptUrl = 'https://greasyfork.org/zh-CN/scripts/604671-example';
const sha = 'a'.repeat(40);
const response = (body, status = 200) => new Response(body, { status });
const success = () => response(JSON.stringify({ updated_scripts: [scriptUrl], updated_failed: [] }));
const options = { secret: 'test-only-secret', sha, code, attempts: 2, wait: async () => {} };

// Catch wrong signatures, repository/ref mappings, and publishing a different commit.
test('sends a signed push for the selected main commit and verifies its published code', async () => {
  const requests = [];
  const version = await publish({ ...options, fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return init.method === 'POST' ? success() : response(code);
  } });
  assert.equal(version, '0.1.2');
  const { url, init } = requests[0];
  assert.equal(url, 'https://api.greasyfork.org/zh-CN/users/1633701-roxi3906/webhook');
  assert.equal(init.headers['X-GitHub-Event'], 'push');
  assert.equal(init.headers['X-Hub-Signature'], `sha1=${createHmac('sha1', options.secret).update(init.body).digest('hex')}`);
  assert.deepEqual(JSON.parse(init.body), {
    ref: 'refs/heads/main',
    repository: {
      html_url: 'https://github.com/roxi3906/magic-monkey-scripts',
      clone_url: 'https://github.com/roxi3906/magic-monkey-scripts.git',
    },
    commits: [{ id: sha, message: 'Publish GitHub Collapse Test Files 0.1.2',
      modified: ['scripts/github-collapse-test-files/github-collapse-test-files.user.js'] }],
  });
  assert.equal(requests.length, 2);
});

test('rejects missing credentials and invalid commit/version before sending anything', async () => {
  for (const invalid of [{ secret: '' }, { sha: 'main' }, { code: 'no metadata' }]) {
    await assert.rejects(publish({ ...options, ...invalid, fetchImpl: async () => assert.fail('unexpected network request') }), /Missing|Invalid/);
  }
});

test('rejects HTTP errors and webhook no-ops or failures', async () => {
  for (const result of [
    () => response('Forbidden', 403),
    () => response('{}'),
    () => response(JSON.stringify({ updated_scripts: [], updated_failed: [] })),
    () => response(JSON.stringify({ updated_scripts: [scriptUrl], updated_failed: [scriptUrl] })),
  ]) {
    await assert.rejects(publish({ ...options, fetchImpl: async () => result() }), /Webhook/);
  }
});

test('accepts script links on the API host used by the webhook endpoint', async () => {
  const version = await publish({ ...options, fetchImpl: async (_, init) => init.method === 'POST'
    ? response(JSON.stringify({ updated_scripts: ['https://api.greasyfork.org/zh-CN/scripts/604671-example'], updated_failed: [] }))
    : response(code) });
  assert.equal(version, '0.1.2');
});

test('waits for stale CDN code but accepts Greasy Fork metadata rewriting', async () => {
  let reads = 0;
  const version = await publish({ ...options, fetchImpl: async (_, init) => {
    if (init.method === 'POST') return success();
    reads += 1;
    return response(reads === 1 ? code.replace('0.1.2', '0.1.0') : code.replace('// @version', '// @downloadURL https://update.greasyfork.org/scripts/604671.user.js\n// @version'));
  } });
  assert.equal(version, '0.1.2');
  assert.equal(reads, 2);
});

test('fails when published version or executable code never matches', async () => {
  for (const published of [code.replace('0.1.2', '0.1.0'), code.replace('"test"', '"different"')]) {
    await assert.rejects(publish({ ...options, fetchImpl: async (_, init) => init.method === 'POST' ? success() : response(published) }), /Published code/);
  }
});
