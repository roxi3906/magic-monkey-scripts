# GitHub 关注面板

[English](README.md)

使用 GitHub 已有登录态，集中关注仓库、分支、PR 和 CI。右下角悬浮按钮展开紧凑卡片界面，黑白灰搭配马尔斯绿，无需 Token 或后端服务。

## 安装

安装最新版桌面 [Tampermonkey](https://www.tampermonkey.net/)，然后[安装脚本](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-watch/github-watch.user.js)。PR 审阅期间，请将分支中的 `.user.js` 文件导入 Tampermonkey；合并后主分支安装链接才生效。本脚本尚未发布到 Greasy Fork。

安装后刷新已有 GitHub 标签页，让它们加入标签发现。仅运行于 `https://github.com/*`，不运行于 iframe；界面为简体中文。

## 使用

1. 点击右下角 **GH** 按钮展开面板。
2. 点击 **关注当前仓库** / **关注当前 PR**，或输入 `owner/repo`、GitHub PR 地址后点击 **添加**。
3. **PR** 组展示标题、编号、作者、开启/草稿/关闭/合并状态、评论数、提交数和 CI 完成数/总数，以及通过、跳过、失败数量（有待完成或未知检查时也单列）。只有数据新鲜且确认 CI 通过的 PR 才自动排到前面；全部跳过、未知、过期或未完成的检查不算全部通过。
4. **仓库** 组展示星数、开启的 PR 数，以及最近创建且仍开启的前五个 PR，包含标题、编号、作者、评论数和 CI。点击 **选择分支** 多选分支，**更多分支** 加载下一页；默认关注默认分支，每个分支显示最新提交和最近五次 Actions 运行。
5. 点击 PR 标题或 **↗**，优先激活已注册的对应标签；没有则新建标签。提交和 Actions 链接打开新标签。卡片 **×** 会先询问是否取消关注，支持保留。Escape 关闭分支编辑器或面板。

## 数据、刷新与权限

- 只向 GitHub 发送同源只读请求，使用 `credentials: 'include'` 复用网页登录态。不读取或存储 Cookie、Token、认证头和完整 HTML，不更改 GitHub 星标、订阅、PR 或仓库内容。
- 关注列表和规范化显示数据保存在 Tampermonkey 本地存储中，按 GitHub 登录账号隔离；私有仓库的标题和元数据也会保存在该本地缓存。切换账号后请刷新页面。取消关注不会立即清除对应缓存，每个账号超过 300 个资源时淘汰旧缓存；彻底清理可在 Tampermonkey 中删除本脚本数据。
- 优先显示缓存。PR、CI、提交和 Actions 的缓存有效期为一分钟；仓库元数据和分支列表为五分钟，支持 ETag 条件请求。**刷新** 检查过期资源并遵循有效期，并非无条件重新下载。失败保留上次数据并标记过期/错误。HTTP 403/429 会退避重试，读取 `Retry-After`，最长一小时。
- 至少有一个运行脚本的 GitHub 标签可见时监控；隐藏标签暂停网络刷新，重新可见时恢复。关闭所有 GitHub 标签后停止监控。单次刷新串行请求，支持 Web Locks 的浏览器会跨标签去重同一资源请求；不安装后台服务、不申请通知权限。
- `GM.getValue`、`GM.setValue`、`GM.deleteValue`、`GM.listValues` 保存本地数据；`GM_getTab`、`GM_saveTab`、`GM_getTabs`、`GM_addValueChangeListener` 协调标签。`GM_openInTab` 新建标签，Tampermonkey 的 [`window.focus` 权限](https://www.tampermonkey.net/documentation.php?q=window) 激活已有标签。其他管理器不保证支持这些能力。

## 兼容性与验证

解析器依据 2026-10-26 实际观察到的 GitHub React 仓库、PR、列表、分支、Actions 和提交页面。网页数据属于内部接口，GitHub 改版可能需要更新脚本。旧版 PR 元数据只有有限兼容；无法确认 CI 与当前 head 提交一致时显示未知，不会置顶。登录过期、SSO 或权限问题需打开原页面处理。未知计数显示 `—`，不伪装成零。CI 失败计数包含取消、超时和需操作等未成功结论；中性结论计入跳过，进行中计数包含排队。Checks 侧栏中能识别的同工作流、同任务重复执行只取最新 job；身份不明确的条目保留，列表缺少圆环中的状态时提示数量不完整。升级到 1.0.1 会重新获取 CI 数据，保留关注列表和其他资源缓存。

已验证真实公开 GitHub HTML 解析，以及隔离 Chromium 中完整脚本的交互、缓存、失败处理和模拟 GM 标签通信。模拟适配器验证了跳转消息和新建标签，**没有代替实际 Tampermonkey 原生标签激活验证**。实际扩展安装、私有仓库 SSO、Firefox 和其他管理器尚未完成端到端验证。

在仓库根目录运行：

```sh
npm ci
npx playwright install chromium
npm test
node --check scripts/github-watch/github-watch.user.js
```

无需构建，无运行时依赖。测试截图写入 Git 忽略的 `.codex/probes/`，不使用你的浏览器配置或 GitHub 数据。

## 反馈与许可证

[反馈问题](https://github.com/roxi3906/magic-monkey-scripts/issues) · [MIT](../../LICENSE)
