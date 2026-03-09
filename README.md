# FN Tree

fnOS 上的磁盘占用分析与文件搜索应用，提供 Tree、Treemap、Search 和统一设置页，面向 NAS 场景下的空间排查与文件定位。

## 功能概览

- Tree 页面：选择已授权目录执行扫描，查看目录层级、详情卡片和 Treemap。
- Search 页面：在已授权目录内执行快速搜索和实时搜索。
- Settings 页面：拆分为主题设置、扫描设置、搜索设置三个页面。
- 深色模式：支持浅色、深色、跟随系统。
- 搜索范围前缀：
  - `@photos cat`：在当前已选授权目录的 `photos` 子目录内搜索 `cat`
  - `/vol1/1000/Dev/photos cat`：在指定绝对路径目录内搜索 `cat`

## 页面预览

### Tree

![Tree 首页](docs/screenshots/tree-home.png)

### Treemap Detail

![Treemap 详情](docs/screenshots/treemap-detail.png)

## 项目结构

```text
FNTree-
|- .official/
|  \- fntree/
|     |- app/
|     |  |- bin/           # gdu / fd 等二进制
|     |  |- server/        # Node.js 后端
|     |  \- ui/            # 前端页面、脚本、样式
|     |- cmd/              # fnOS 生命周期脚本
|     |- config/           # 权限与资源声明
|     |- wizard/           # 安装向导
|     \- manifest          # fnpack 清单
|- docs/                   # 截图与设计资料
|- scripts/                # 辅助脚本
|- .gitignore
\- README.md
```

重点文件：

- `.official/fntree/app/ui/index.html`
- `.official/fntree/app/ui/styles.css`
- `.official/fntree/app/ui/app.js`
- `.official/fntree/app/ui/search.js`
- `.official/fntree/app/ui/settings.html`
- `.official/fntree/app/ui/settings.js`
- `.official/fntree/app/ui/theme.js`
- `.official/fntree/app/server/server.js`
- `.official/fntree/manifest`

## 技术栈

- Frontend: 原生 HTML / CSS / JavaScript
- UI: [mdui](https://www.mdui.org/)
- Backend: Node.js
- Disk usage: `gdu`
- Search: `fd` / `fdfind`
- Packaging: `fnpack`

## 运行依赖

- fnOS 应用运行环境
- Node.js 22
- Linux 版 `gdu`
- Linux 版 `fd` 或 `fdfind`
- `fnpack.exe`

## 本地开发

实际应用源码目录：

```text
.official/fntree
```

常改位置：

- 前端：`.official/fntree/app/ui`
- 后端：`.official/fntree/app/server`
- 版本清单：`.official/fntree/manifest`

建议流程：

1. 修改前端或后端代码。
2. 对相关脚本执行 `node --check`。
3. 进入 `.official/fntree` 执行打包。
4. 安装前解包核对包内文件。

## 打包

```powershell
Set-Location .official/fntree
& ../../.tooling/fnpack.exe build
```

输出文件：

```text
.official/fntree/fntree.fpk
```

注意：

- fnOS 只允许安装更高版本号的程序。
- 生成可安装包前，需要先递增 `.official/fntree/manifest` 中的 `version`。
- 根目录下的 `fntree_*.fpk` 仅用于本地安装测试，不应提交到 GitHub。

## 使用说明

### Tree

1. 选择一个已授权目录。
2. 点击“开始分析”。
3. 查看 Treemap、详情卡片和当前层级子项。

### Search

1. 选择搜索范围。
2. 选择“快速搜索”或“实时搜索”。
3. 输入关键词，或使用 `@子目录` / `/绝对路径` 缩小范围。
4. 使用筛选、排序、面包屑和详情面板查看结果。

### Settings

可配置内容包括：

- 主题色
- 明暗模式
- 扫描统计方式
- 前 N 项显示数量
- Treemap 最大显示块数
- 搜索索引周期
- 参与索引的授权目录

## 仓库说明

- 仓库以应用源码为主，不包含正式发布产物。
- `docs/` 中保留截图和设计资料。
- `scripts/` 中保留辅助脚本。
- 临时验证目录、安装包和构建产物已在 `.gitignore` 中排除。

## 维护建议

如果要继续维护，建议优先阅读：

- `.official/fntree/app/ui/index.html`
- `.official/fntree/app/ui/styles.css`
- `.official/fntree/app/ui/app.js`
- `.official/fntree/app/ui/search.js`
- `.official/fntree/app/ui/settings.js`
- `.official/fntree/app/ui/theme.js`
- `.official/fntree/app/server/server.js`
