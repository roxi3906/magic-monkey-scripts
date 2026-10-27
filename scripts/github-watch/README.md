# GitHub Watch Panel

[简体中文](README.zh-CN.md)

A compact floating dashboard for GitHub repositories, branches, pull requests, and CI. Uses your existing GitHub browser session; no personal access token or backend is required.

## Install

Use a current desktop [Tampermonkey](https://www.tampermonkey.net/) release, then [install the userscript](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-watch/github-watch.user.js). While this change is in review, import the `.user.js` file from the PR branch into Tampermonkey; the main-branch installation URL becomes available after merge. This script has not been published to Greasy Fork.

Refresh existing GitHub tabs after installing so they can participate in tab discovery. The interface is in Simplified Chinese and runs only on `https://github.com/*`, outside frames.

## Use

1. Click the **GH** button at the bottom right.
2. Open the GitHub page to follow and use **关注当前仓库** / **关注当前 PR**. Only the current tab can be added; there is no address input. Group switches sit below the follow controls.
3. Switch between **PR** and **仓库** groups. PR cards show title, number, author, state, comment count, commit count and completed/total CI checks, with separate passed, skipped and failed counts (plus pending or unknown counts when present). PR states use prominent badges; running and queued CI counts and check names remain visible even when another check has failed. Fresh PRs with passing CI sort first; skipped-only, missing, failed, stale and pending checks do not.
4. Repository cards show stars, the open PR count and the five most recently created open PRs, including their author, CI, comment count and creation time in the browser’s local time zone (or an explicit unknown label). **选择分支** opens a multi-select list with **更多分支** pagination. The default branch is selected initially; each selected branch shows its latest commit and five recent Actions runs.
5. Click a PR title or **↗** to focus a matching registered tab; otherwise a new active tab opens. Commit and Actions links open new tabs. Click **×** on a card to remove it, then confirm or keep following. Escape closes the branch editor or panel.

6. Followed PRs (including repository previews) notify when observed incomplete CI becomes fully complete on the same commit. Notifications include the PR number/title and passed/failed counts; failed and skipped checks also count as finished. Already completed results on first load establish a silent baseline. Clicking reuses a matching PR tab or opens one; a fallback URL remains available after the sender unloads. Completion baselines are shared across tabs to prevent duplicate notifications.

## Data, refresh and permissions

- Same-origin, read-only GitHub page requests use `credentials: 'include'`. The script never reads or stores cookies, tokens, authentication headers or entire HTML responses. It never changes stars, GitHub subscriptions, PRs or repository content.
- Follows and normalized display data are stored locally in Tampermonkey storage, partitioned by GitHub login. Private repository titles and metadata remain in that local cache. Account changes require a page refresh. Removing a follow does not immediately erase its cached display data; older cache entries are evicted beyond 300 resources per account. Delete the script's data in Tampermonkey to clear it completely.
- Cached results render first. All display resources expire after 30 seconds. Requests use ETags where available. **刷新** updates expired resources and respects these TTLs; it is not an unconditional reload. Failed refreshes retain previous data with an explicit stale/error notice. HTTP 403/429 responses back off, respecting `Retry-After` with a one-hour cap.
- Updates are attempted every 30 seconds, including in hidden tabs and with the panel closed; returning to a visible tab checks expired data. Browser timer throttling, frozen tabs and computer sleep can delay updates, so an exact 30-second cadence is not guaranteed. Closing every GitHub tab stops monitoring. Requests are sequential within each refresh, and Web Locks deduplicate the same resource across tabs where supported. There is no background service; completion notifications use Tampermonkey’s browser notification API.
- `GM_notification` sends completion notifications. Allow notifications for Tampermonkey, your browser and your OS. OS notification settings or Do Not Disturb can suppress delivery; the script cannot verify native display. API errors appear in the panel and are retried on the next check. Completion notifications require Web Locks for cross-tab deduplication; unsupported browsers show an explanatory message while monitoring continues.
- `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues` persist local state. `GM_getTab`, `GM_saveTab`, `GM_getTabs` and `GM_addValueChangeListener` coordinate script-enabled tabs. `GM_openInTab` opens new tabs; Tampermonkey's [`window.focus` grant](https://www.tampermonkey.net/documentation.php?q=window) activates an existing tab. Other script managers are not guaranteed to support these capabilities.

## Compatibility and verification

GitHub's webpage payloads are internal interfaces. Parsers target the React repository, PR, pull-list, branches, Actions and commits routes observed on 2026-10-26. Legacy PR metadata has a limited fallback; if the current head cannot be matched to the CI head, CI stays unknown instead of being promoted. Changes to GitHub markup, login expiry, SSO or permissions can require opening the original page. Unknown values render as `—`, not zero. Failed CI counts include cancelled, timed-out and action-required outcomes; neutral results count as skipped, and pending includes queued checks. Recognizable repeated Actions jobs with the same workflow and job name use the latest job; unidentified entries are retained. A chart status missing from the readable list is flagged as incomplete. Version 1.1.0 refetches CI and PR metadata for active check names and creation times, preserving follows and other resource caches.

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
