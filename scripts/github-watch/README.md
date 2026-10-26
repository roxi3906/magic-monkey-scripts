# GitHub Watch Panel

[简体中文](README.zh-CN.md)

A compact floating dashboard for GitHub repositories, branches, pull requests, and CI. Uses your existing GitHub browser session; no personal access token or backend is required.

## Install

Use a current desktop [Tampermonkey](https://www.tampermonkey.net/) release, then [install the userscript](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-watch/github-watch.user.js). While this change is in review, import the `.user.js` file from the PR branch into Tampermonkey; the main-branch installation URL becomes available after merge. This script has not been published to Greasy Fork.

Refresh existing GitHub tabs after installing so they can participate in tab discovery. The interface is in Simplified Chinese and runs only on `https://github.com/*`, outside frames.

## Use

1. Click the **GH** button at the bottom right.
2. Use **关注当前仓库** / **关注当前 PR**, or enter `owner/repo` or a GitHub PR URL and click **添加**.
3. Switch between **PR** and **仓库** groups. PR cards show title, number, author, state, comment count, commit count and completed/total CI checks. Fresh PRs with passing CI sort first; skipped-only, missing, failed, stale and pending checks do not.
4. Repository cards show stars, the open PR count and the five most recently created open PRs, including their author, CI and comment count. **选择分支** opens a multi-select list with **更多分支** pagination. The default branch is selected initially; each selected branch shows its latest commit and five recent Actions runs.
5. Click a PR title or **↗** to focus a matching registered tab; otherwise a new active tab opens. Commit and Actions links open new tabs. Click **×** on a card to remove it, then confirm or keep following. Escape closes the branch editor or panel.

## Data, refresh and permissions

- Same-origin, read-only GitHub page requests use `credentials: 'include'`. The script never reads or stores cookies, tokens, authentication headers or entire HTML responses. It never changes stars, GitHub subscriptions, PRs or repository content.
- Follows and normalized display data are stored locally in Tampermonkey storage, partitioned by GitHub login. Private repository titles and metadata remain in that local cache. Account changes require a page refresh. Removing a follow does not immediately erase its cached display data; older cache entries are evicted beyond 300 resources per account. Delete the script's data in Tampermonkey to clear it completely.
- Cached results render first. PRs, checks, commits and Actions expire after one minute; repository metadata and branch choices after five minutes. Requests use ETags where available. **刷新** updates expired resources and respects these TTLs; it is not an unconditional reload. Failed refreshes retain previous data with an explicit stale/error notice. HTTP 403/429 responses back off, respecting `Retry-After` with a one-hour cap.
- Monitoring runs while at least one GitHub tab running the script is visible; hidden tabs pause network work and resume on visibility. Closing every GitHub tab stops monitoring. Requests are sequential within each refresh, and Web Locks deduplicate the same resource across tabs where supported. There is no background service or notification permission.
- `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues` persist local state. `GM_getTab`, `GM_saveTab`, `GM_getTabs` and `GM_addValueChangeListener` coordinate script-enabled tabs. `GM_openInTab` opens new tabs; Tampermonkey's [`window.focus` grant](https://www.tampermonkey.net/documentation.php?q=window) activates an existing tab. Other script managers are not guaranteed to support these capabilities.

## Compatibility and verification

GitHub's webpage payloads are internal interfaces. Parsers target the React repository, PR, pull-list, branches, Actions and commits routes observed on 2026-10-26. Legacy PR metadata has a limited fallback; if the current head cannot be matched to the CI head, CI stays unknown instead of being promoted. Changes to GitHub markup, login expiry, SSO or permissions can require opening the original page. Unknown values render as `—`, not zero.

Verification includes actual public GitHub HTML parsing and isolated Chromium browser tests of the full script with a controlled GitHub network and GM API adapter. The adapter verifies routing and focus requests; it does **not** prove native Tampermonkey tab activation. Actual extension installation, private-repository SSO access, Firefox and other script managers have not been end-to-end verified.

From the repository root:

```sh
npm ci
npx playwright install chromium
npm test
node --check scripts/github-watch/github-watch.user.js
```

No build step or runtime dependency is needed. Tests keep screenshots in Git-ignored `.codex/probes/` and do not use your browser profile or GitHub data.

## Feedback and license

[Report an issue](https://github.com/roxi3906/magic-monkey-scripts/issues) · [MIT](../../LICENSE)
