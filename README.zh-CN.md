# Magic Monkey Scripts

[English](README.md)

集中维护实用油猴脚本的仓库。每个脚本都有独立目录、使用说明和版本，可以独立发布到 Greasy Fork。

## 脚本列表

| 脚本                                                                       | 说明                                                      | 安装                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [GitHub 复制文件路径与行号](scripts/github-copy-path-line/README.zh-CN.md) | 从 GitHub Pull Request 差异中复制所选文件路径和行号范围。 | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/591850-github-%E5%A4%8D%E5%88%B6%E6%96%87%E4%BB%B6%E8%B7%AF%E5%BE%84%E4%B8%8E%E8%A1%8C%E5%8F%B7) / [GitHub](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-copy-path-line/github-copy-path-line.user.js) |
| [GitHub 关注面板](scripts/github-watch/README.zh-CN.md)                    | 关注仓库、分支、PR 和 CI，支持本地缓存与标签跳转。        | [GitHub](https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-watch/github-watch.user.js)                                                                                                                                                                         |

## 安装方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 等用户脚本管理器。
2. 打开所需脚本的安装链接。
3. 查看脚本申请的权限，然后确认安装。

每个脚本支持的页面和具体用法请查看对应目录下的 README。

## 仓库结构

`scripts/` 下的每个目录都是独立版本的用户脚本。这样既能在一个仓库中统一维护，也能让每个脚本分别发布。

## 许可证

[MIT](LICENSE)
