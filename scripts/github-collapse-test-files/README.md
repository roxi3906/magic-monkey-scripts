# GitHub Collapse Test Files

[简体中文](README.zh-CN.md)

Automatically collapses files whose names end in `.test.[extension]` in GitHub pull request diffs. File headers stay visible, and you can expand any file with GitHub's usual button.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or another userscript manager.
2. [Install from Greasy Fork](https://greasyfork.org/en/scripts/604671) and confirm in your userscript manager.
3. Reload your GitHub tab.

The script is standalone and does not require the other scripts in this repository.

## Updates

Tampermonkey checks and downloads updates from Greasy Fork. Enable automatic updates in your userscript manager, or run a manual update check.

If you installed version 0.1.1 from GitHub, its next update to 0.1.2 switches the update source to Greasy Fork. You can also reinstall using the link above. Disable any duplicate copy if your manager retains both scripts.

### Automatic publishing

The **Publish to Greasy Fork** GitHub Actions workflow publishes this script when its source changes on `main`. It can also be run manually from the Actions tab, selecting `main`. Each release must increase `@version`; code changes alone do not offer a normal userscript update.

One-time setup: in Greasy Fork's script administration page, set the sync URL to this script's [raw source on main](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-collapse-test-files/github-collapse-test-files.user.js), with manual sync. Generate a secret on your account's [webhook settings page](https://greasyfork.org/en/users/webhook-info), and save it in this repository's Actions secrets as `GREASYFORK_WEBHOOK_SECRET`. Keep it out of code and logs. This is an account-wide webhook secret; other integrations using it must be updated if it is regenerated.

The workflow sends a signed webhook for only this script, then checks the published version and executable code. A failed sync or mismatched release fails the workflow. Greasy Fork switches the sync mode to Webhook after the first successful notification. The workflow always checks out current `main`, including on reruns, and keeps the existing Greasy Fork descriptions.

## Behavior

- Acts only on `github.com` pull request **Changes / Files changed** pages (`/pull/<number>/changes` and `/pull/<number>/files`, including commit comparison subpaths).
- Collapses `app.test.ts`, `app.test.tsx`, `app.test.js`, `app.integration.test.py`, and other filenames with a single extension after `.test.`. Matching is case-sensitive.
- Leaves `app.spec.ts`, `test.ts`, `app.test.ts.snap`, and ordinary files inside test directories unchanged.
- Handles files added by lazy loading and navigation within GitHub.
- Leaves already collapsed files alone. Files you manually expand stay open through rerenders for the current diff route; reloading or changing the diff route resets this choice.
- Uses GitHub's native collapse button and never marks files as **Viewed**.

The userscript matches all GitHub pages so it can activate when GitHub navigates to a PR diff without reloading the document. It only collapses files on the supported diff routes. No settings or extra buttons are added.

## Compatibility and Privacy

Designed against GitHub's React diff header structure inspected on November 6, 2026. GitHub DOM changes may require updates. The script requests no special permissions, makes no network requests, and stores no persistent data.

## Validation

```sh
npm ci
node --test tests/github-collapse-test-files.test.cjs
```

The browser tests use local fixtures modeled on the observed GitHub headers. They cover filename boundaries, native toggle behavior, manual expansion, lazy loading, rerenders, delayed controls, route changes, and host restrictions. They do not install the script into Tampermonkey on a live GitHub account.

## License

[MIT](../../LICENSE)
