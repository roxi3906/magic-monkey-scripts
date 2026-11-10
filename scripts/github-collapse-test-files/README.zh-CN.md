# GitHub 自动折叠测试文件

[English](README.md)

在 GitHub PR 的代码差异页面自动折叠文件名以 `.test.[扩展名]` 结尾的文件，保留文件标题，需要时仍可通过 GitHub 原有按钮展开。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 等用户脚本管理器。
2. 点击[从 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/604671)，在脚本管理器中确认安装。
3. 刷新 GitHub 标签页。

这是独立脚本，不依赖仓库中的其他脚本。

## 更新

油猴从 Greasy Fork 检查并下载更新。请在脚本管理器中启用自动更新，也可以手动检查更新。

如果安装过 GitHub 版 0.1.1，下次更新到 0.1.2 后会切换至 Greasy Fork 更新源，也可以使用上面的链接重新安装。如果管理器保留了两份脚本，请停用重复的副本。

### 自动发布

GitHub Actions 中的 **Publish to Greasy Fork** 工作流会在 `main` 上本脚本源码变更时自动发布，也可在 Actions 页面选择 `main` 手动运行。每次发布须递增 `@version`；仅修改代码不会触发油猴的正常更新。

首次配置：在 Greasy Fork 脚本管理页将同步地址设为本脚本的 [main 分支原始文件](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-collapse-test-files/github-collapse-test-files.user.js)，选择手动同步。在账号的 [Webhook 设置页](https://greasyfork.org/zh-CN/users/webhook-info)生成密钥，保存到本仓库的 Actions Secret `GREASYFORK_WEBHOOK_SECRET`，不要写入源码或日志。该密钥属于整个 Greasy Fork 账号，重新生成后，其他使用它的集成也需要更新。

工作流只为本脚本发送签名通知，随后核对线上版本和可执行代码；同步失败或内容不一致时，工作流会失败。首次通知成功后，Greasy Fork 会将同步类型切换为 Webhook。手动重跑也始终读取最新 `main`，并保留 Greasy Fork 上已有的说明文字。

## 行为

- 仅在 `github.com` 的 PR **Changes / Files changed** 页面生效，包括 `/pull/<编号>/changes`、`/pull/<编号>/files` 及其提交对比子路径。
- 折叠 `app.test.ts`、`app.test.tsx`、`app.test.js`、`app.integration.test.py` 等文件；`.test.` 后必须为单段扩展名，区分大小写。
- 不折叠 `app.spec.ts`、`test.ts`、`app.test.ts.snap`，也不会仅因文件位于测试目录中就折叠。
- 支持滚动加载的新文件和 GitHub 站内导航。
- 已折叠文件保持原状。手动展开的文件在当前差异页面重绘后仍保留展开选择；刷新或切换差异页面后重新自动折叠。
- 调用 GitHub 原生折叠按钮，不会勾选 **Viewed / 已查看**。

脚本匹配所有 GitHub 页面，以便从其他页面不刷新跳转到 PR 差异页时也能生效；实际折叠操作仅发生在上述差异页面。不增加设置或额外按钮。

## 兼容性与隐私

依据 2026 年 11 月 6 日检查的 GitHub React 差异文件头结构实现。GitHub 修改页面结构后可能需要适配。脚本不申请特殊权限，不发起网络请求，也不持久化任何数据。

## 验证

```sh
npm ci
node --test tests/github-collapse-test-files.test.cjs
```

浏览器测试使用根据实际 GitHub 文件头构建的本地页面，覆盖文件名边界、原生折叠交互、手动展开、动态加载、重绘、延迟出现的控件、页面切换和域名限制。测试不包含在真实 GitHub 账号中安装 Tampermonkey 脚本。

## 许可证

[MIT](../../LICENSE)
