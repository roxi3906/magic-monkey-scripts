# Magic Monkey Scripts 发布设计

## 目标

建立一个公开的多脚本仓库，用统一入口维护 Roxi 的用户脚本，并将首个 GitHub 代码审查辅助脚本发布到 Greasy Fork。

## 仓库与目录

- GitHub 仓库：`roxi3906/magic-monkey-scripts`
- 本地目录：`/Users/roxi/other_projects/magic-monkey-scripts`
- 默认分支：`main`
- 许可证：MIT

```text
magic-monkey-scripts/
├── README.md
├── README.zh-CN.md
├── LICENSE
└── scripts/
    └── github-copy-path-line/
        ├── github-copy-path-line.user.js
        ├── README.md
        └── README.zh-CN.md
```

根目录 README 作为全部脚本的索引。每个脚本使用独立目录，保存脚本文件和双语说明，以便独立发布、升级和迁移。

## 首个脚本

脚本沿用现有版本 `0.5.0` 和现有行为：在 GitHub Pull Request diff 的行选择菜单中增加“复制路径:行号”，支持单行和多行范围。

发布前只整理用户脚本元数据，不修改功能逻辑。元数据将包含作者、MIT 许可、项目主页、问题反馈地址，以及指向 GitHub Raw 文件的下载和更新地址。

## 文档

英文 `README.md` 是 GitHub 默认入口，顶部提供中文入口；中文 `README.zh-CN.md` 提供英文入口。根目录文档介绍仓库结构和脚本清单，脚本目录文档介绍：

- 支持范围与复制结果格式
- Tampermonkey 安装方法
- GitHub Raw 与 Greasy Fork 安装入口
- 在 GitHub Pull Request diff 中的具体用法
- 权限、隐私、兼容性和问题反馈

## 发布流程

1. 完成本地文件并提交到 `main`。
2. 创建公开 GitHub 仓库并推送。
3. 核对 GitHub 页面和 Raw 脚本地址。
4. 在 Greasy Fork 创建独立脚本条目，使用 GitHub Raw 地址同步代码更新。
5. 将最终 Greasy Fork 地址补充进中英文 README，再提交并推送。

Greasy Fork 若需要用户现有登录态或验证码，则在浏览器中保留发布页面并请用户完成该交互，随后继续核对结果。

## 验证

采用用户选择的扩展验证范围：

- 检查 JavaScript 语法和 userscript 元数据必需字段。
- 检查中英文 README 的站内链接、GitHub 链接和安装地址。
- 从 GitHub Raw 地址验证脚本可访问且能触发用户脚本安装。
- 从 Greasy Fork 页面验证安装入口及 GitHub 同步来源。
- 在实际 GitHub diff 页面验证单行或多行复制的主要流程；若没有合适的公开 diff 页面，使用可访问的 GitHub Pull Request diff 做最接近验证，并如实记录覆盖边界。

## 非目标

- 不重构或扩展脚本功能。
- 不创建自动发布流水线。
- 不连接 Tart 虚拟机。
- 不为尚未存在的脚本预建空目录。
