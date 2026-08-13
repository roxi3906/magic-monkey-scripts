# GitHub Copy Path & Line

[简体中文](README.zh-CN.md)

Adds a **Copy path:line** action to the line menu in GitHub pull request diffs. It copies a reference that you can paste directly into code reviews, issue descriptions, terminal commands, and AI coding tools.

## Install

You need a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).

- [Install from GitHub](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-copy-path-line/github-copy-path-line.user.js)
- Greasy Fork installation will be added after the first community release.

## Usage

1. Open the **Files changed** tab of a GitHub pull request.
2. Click a line number to select one line, or select a range of lines.
3. Open the selected line's menu.
4. Choose **复制路径:行号**.
5. Paste the copied reference where you need it.

Examples:

```text
src/app.js:42
src/app.js:42-47
```

## Compatibility

- Runs on `https://github.com/*`.
- Designed for GitHub's current React-based pull request diff interface.
- The menu label and success messages are currently in Simplified Chinese.

## Permissions and Privacy

The script requests `GM_setClipboard` only to copy the generated reference. It does not collect data, make network requests, or send page content anywhere.

## Feedback

[Report an issue](https://github.com/roxi3906/magic-monkey-scripts/issues)

## License

[MIT](../../LICENSE)

