# GitHub 复制文件路径与行号

[English](README.md)

在 GitHub Pull Request 差异页面的行菜单中增加 **复制路径:行号** 操作。复制结果可以直接粘贴到代码审查意见、Issue 描述、终端命令或 AI 编程工具中。

## 安装

请先安装 [Tampermonkey](https://www.tampermonkey.net/) 等用户脚本管理器。

- [从 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/591850-github-%E5%A4%8D%E5%88%B6%E6%96%87%E4%BB%B6%E8%B7%AF%E5%BE%84%E4%B8%8E%E8%A1%8C%E5%8F%B7)（推荐）
- [从 GitHub 安装](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-copy-path-line/github-copy-path-line.user.js)

## 使用方法

1. 打开 GitHub Pull Request 的 **Files changed** 页面。
2. 单击一个行号选择单行，或者选择一段连续的行号。
3. 打开所选代码行的菜单。
4. 选择 **复制路径:行号**。
5. 在需要的位置粘贴复制结果。

复制结果示例：

```text
src/app.js:42
src/app.js:42-47
```

## 兼容性

- 运行范围为 `https://github.com/*`。
- 针对 GitHub 当前基于 React 的 Pull Request diff 界面设计。
- GitHub 更新页面结构后，脚本可能需要同步适配。

## 权限与隐私

脚本仅申请 `GM_setClipboard` 权限，用于复制生成的路径与行号。它不会收集数据、发起网络请求，也不会把页面内容发送到任何位置。

## 问题反馈

[提交 Issue](https://github.com/roxi3906/magic-monkey-scripts/issues)

## 许可证

[MIT](../../LICENSE)
