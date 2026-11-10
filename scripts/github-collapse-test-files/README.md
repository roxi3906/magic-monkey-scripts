# GitHub Collapse Test Files

[简体中文](README.zh-CN.md)

Automatically collapses files whose names end in `.test.[extension]` in GitHub pull request diffs. File headers stay visible, and you can expand any file with GitHub's usual button.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or another userscript manager.
2. Create a new userscript and replace its contents with [github-collapse-test-files.user.js](github-collapse-test-files.user.js).
3. Save, then reload your GitHub tab.

The script is standalone and does not require the other scripts in this repository.

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
