const { createHmac } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { setTimeout } = require('node:timers/promises');

const scriptPath = 'scripts/github-collapse-test-files/github-collapse-test-files.user.js';
const repository = 'https://github.com/roxi3906/magic-monkey-scripts';
const webhookUrl = 'https://api.greasyfork.org/zh-CN/users/1633701-roxi3906/webhook';
const codeUrl = 'https://update.greasyfork.org/scripts/604671.user.js';
const versionOf = (code) => code.match(/^\/\/\s*@version\s+(\S+)/m)?.[1];
const bodyOf = (code) => code.split('// ==/UserScript==')[1]?.trim();

const publish = async ({ secret, sha, code, fetchImpl = fetch, attempts = 12, wait = setTimeout }) => {
  const version = versionOf(code);
  if (!secret) throw new Error('Missing GREASYFORK_WEBHOOK_SECRET');
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Invalid commit SHA');
  if (!version || !bodyOf(code)) throw new Error('Invalid userscript metadata or body');

  // Greasy Fork's GitHub webhook requires HMAC-SHA1 and a modified-file list.
  // Use the checked-out commit so the fetched source matches what we validate.
  const payload = JSON.stringify({
    ref: 'refs/heads/main',
    repository: { html_url: repository, clone_url: `${repository}.git` },
    commits: [{ id: sha, message: `Publish GitHub Collapse Test Files ${version}`, modified: [scriptPath] }],
  });
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'push',
      'X-Hub-Signature': `sha1=${createHmac('sha1', secret).update(payload).digest('hex')}`,
    },
    body: payload,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.updated_scripts) || !Array.isArray(result.updated_failed) ||
      result.updated_failed.length || !result.updated_scripts.some((url) => /^https:\/\/(?:api\.)?greasyfork\.org\/[^/]+\/scripts\/604671(?:-|$)/.test(url))) {
    throw new Error('Webhook did not confirm publication of script 604671; check Greasy Fork sync settings');
  }

  // The CDN may lag. Greasy Fork rewrites metadata, so compare the version and executable body.
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await wait(10_000);
    const published = await fetchImpl(codeUrl, { method: 'GET', signal: AbortSignal.timeout(30_000) });
    if (!published.ok) continue;
    const contents = await published.text();
    if (versionOf(contents) === version && bodyOf(contents) === bodyOf(code)) return version;
  }
  throw new Error(`Published code does not match version ${version} at commit ${sha}`);
};

module.exports = { publish };

if (require.main === module) {
  publish({ secret: process.env.GREASYFORK_WEBHOOK_SECRET, sha: process.env.PUBLISH_SHA, code: readFileSync(scriptPath, 'utf8') })
    .then((version) => console.log(`Verified Greasy Fork script 604671 version ${version}`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
