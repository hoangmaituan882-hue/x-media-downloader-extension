# 开发与维护

普通用户请从[项目首页](../README.md)下载即用安装包。以下内容用于修改源码和制作新版本。

## 构建

```bash
npm ci
npm run build
npx tsc --noEmit
```

浏览器加载 `dist/`。每次修改源码后都需要重新构建、在扩展管理页重新加载，再刷新 X 页面。
构建不会进行类型检查，`tsc` 需要单独运行。

## 制作安装包

```bash
npm run package:extension
npm run test:package
```

命令会先构建，再在 `release/v版本号/` 生成：

```text
release/v7.7.0/
├── X-Media-Downloader/            ← 可直接加载的文件夹
├── 安装说明.html                  ← 可离线打开
├── x-media-downloader-v7.7.0.zip   ← GitHub Release 下载文件
└── SHA256SUMS.txt
```

打包前会校验版本和资源引用，缺少后台脚本、图标、画廊资源时会停止。
只有浏览器使用的文件会进入安装包，测试页与 source map 会排除。
`test:package` 会检查校验和、解压 ZIP、逐文件核对构建内容，再用隔离的 Edge 配置加载解压出的扩展，检查下载通道和画廊。

## 验证

```bash
npm test
npm run test:media-views
npm run test:inline-media
npm run test:hover-preview
npm run test:extension
```

浏览器测试使用已安装的 Microsoft Edge。详细覆盖范围见[测试说明](../tests/README.md)。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/core/` | 采集、下载、命名、去重、历史和设置 |
| `src/ui/` | 面板、四种媒体视图、预览和页内按钮 |
| `src/gallery/` | 独立画廊 |
| `src/components/motion/` | 适配后的 beUI 动效组件 |
| `extension/` | 扩展清单、后台脚本、页面钩子和图标 |
| `dist/` | 可加载的扩展构建 |
| `scripts/` | 静态资源整理和发布打包 |
| `tests/` | 核心行为与真实浏览器回归 |
| `docs/` | 安装说明和文档图片 |

项目约定见 [AGENTS.md](../AGENTS.md)，历史变更见[更新记录](../CHANGELOG.md)。
本地可选技能位于 `.agents/`，不随项目分发。
