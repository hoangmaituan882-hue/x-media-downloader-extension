# X Media Downloader — 浏览器扩展版（v7.7 · React UI）

基于注入版 v7.2 演进的 Manifest V3 扩展。v7.3 起 UI 层迁移到
**React 19 + Motion + Tailwind CSS v4**，动画组件采用
[beUI v2](https://github.com/starc007/ui-components)（MIT，源码复制进本仓库，见
`src/components/motion/ATTRIBUTION.md`），面板渲染在 **Shadow DOM** 内，
与 x.com 页面样式完全隔离。

## 功能

- 三种采集：快速扫描 / 自动加载（无限滚动）/ API 分页抓取（GraphQL）
- 四种媒体视图：列表 / 卡片 / 推文 / 打包，切换时缩略图共享元素位移
- 增量备份：扩展环境记录存 chrome.storage.local，本地测试回退 localStorage；再次采集自动跳过
- 时间线命名（Snowflake ID / API created_at），同一天单张不加序号、多张从 001 计数
- 自定义文件夹 + 子文件夹（File System Access API），默认按博主建子目录
- 3 路并发下载 + 失败重试 + 浏览器下载回退（媒体字节经后台 Service Worker 抓取，绕开 CORS）
- 日期区间过滤：批量下载只下最近 N 天发布的媒体
- 订阅推送：关注博主 + 定时「真人式」访问自动备份新内容 + 结果记录 + 桌面通知
- 历史页（统计 / 博主榜 / 日期过滤 / 真实头像）+ 画廊页（日期分组 / 批量补下载 / 灯箱）
- 下载动画（蚀刻点阵 / 跑马灯画廊）接管面板
- 动效 UI：beUI 状态按钮（下载按钮 idle→loading→success/error）、弹簧开关、
  分段 Tabs、动画 Toast 栈、Motion 拖拽面板

## 安装（Chrome / Edge）

扩展目录是构建产物 **`dist/`**，不是仓库根目录：

仓库已包含构建好的 `dist/`。下载仓库 ZIP 并解压后，可直接从下面第 3 步加载。
修改源码后，需要重新构建，并在扩展管理页重新加载扩展，再刷新 x.com 页面。

1. `npm install`
2. `npm run build`（生成 `dist/`）
3. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」
4. 「加载已解压的扩展程序」→ 选择 **`dist`** 目录
5. 刷新 x.com，右上角出现面板即生效

开发时可用 `npm run watch` 持续构建（改动后在扩展页点「刷新」重载）。

## 目录结构

```
├── src/
│   ├── content.tsx            入口：Shadow DOM 挂载 React 应用
│   ├── styles.css             Tailwind v4 + shadcn 颜色令牌
│   ├── core/                  框架无关的核心逻辑（自 v7.2 移植）
│   │   ├── engine.ts          zustand 状态机：扫描/滚动/API/下载编排
│   │   ├── scanner.ts         DOM 媒体扫描 + 时间提取
│   │   ├── api.ts             GraphQL UserMedia 模板捕获与分页解析
│   │   ├── downloader.ts      后台抓取通道 / FS API / 浏览器回退
│   │   ├── store.ts           已下载记录（localStorage）
│   │   ├── page.ts            页面上下文 / 滚动
│   │   └── utils.ts           URL 升级 / 扩展名检测 / Snowflake / 命名
│   ├── components/motion/     beUI 组件源码（MIT，见 ATTRIBUTION.md）
│   └── ui/                    面板 / 网格 / Toast / 内联按钮
├── extension/                 静态扩展文件（构建时拷入 dist）
│   ├── manifest.json
│   ├── background.js          Service Worker：代理媒体字节抓取
│   └── icons/
├── vite.config.ts             IIFE 单文件构建 + 静态拷贝
└── dist/                      ← 装进浏览器的目录（构建产物）
```

## 使用说明

- **API 模式**：先点页面上的「媒体」标签让 X 客户端加载一次列表（扩展借此捕获
  请求模板，免疫 queryId 变化），再点面板「API」按钮。
- **保存位置**：点「选择」挑文件夹，可填子文件夹名（资料页默认预填博主用户名）。
  文件夹句柄不跨会话持久化，刷新页面后需重新选择。
- **已下载自动跳过**：单张下载完成后面板同步显示「已下载」，后续扫描及批量勾选自动排除；「清空记录」可重置，需要找回文件时可在历史页补下载。
- **Escape** 折叠面板；面板头部可拖拽移动。

## v7.7 当前版本修复

- 列表、卡片、推文、打包视图的共享缩略图平滑位移。
- 修复启动读档、Chrome 消息传输媒体字节及下载完成状态判断。
- 单张和批量下载提前预留序号，按实际保存目录分组，避免并发重名。
- API 模板核验博主归属，避免切换页面后混用上一位博主的请求。
- 单张下载复用面板中的媒体项，成功后自动更新已下载状态，失败保留重试。
- 图片页内按钮从圆形展开为「下载原图」胶囊，视频播放层与封面层均支持下载。
- 修复悬停大图反复收回；列表、卡片、推文及历史页预览保持稳定。

## 开发验证

```bash
npm ci
npx tsc --noEmit
npm test
npm run test:media-views
npm run test:inline-media
npm run test:hover-preview
npm run build
npm run test:extension
```

浏览器回归使用已安装的 Microsoft Edge。详见 `tests/README.md`。
本地 `.agents/` 技能目录与测试截图不属于发布文件。

## v7.6 新功能与修复

### 新功能

- **按博主分组网格**：浏览刷帖（inline 采集）时网格按博主分组，组头显示头像 +
  用户名 + 张数，48px 迷你卡片 flex 排布。
- **下载历史页**（面板顶栏入口 / `#xmd-history` 深链）：总媒体 / 今日 / 博主 / 总体积
  统计、最近 14 天柱状图（点柱过滤）、博主榜（按张数 / 最近）、下钻缩略图 + 预览
  morph、CSV/JSON 导出、打开画廊、长按清空全部历史。
- **画廊页**（`gallery.html`）：按日期分组无限滚动、批量补下载、灯箱、按博主过滤
  （历史页「打开画廊」传 `?user=`）。
- **下载动画**：设置可选「蚀刻点阵」（canvas 网格 + 底部跑马灯，随下载密度动态
  排布、鼠标扰动）或「跑马灯画廊」（大计数 + 三行反向跑马灯），下载时接管面板。
- **命名优化**：同一天单张不加 `_001`、两张以上从 `_001` 计数；文件夹默认按博主名；
  历史列表与画廊头部显示博主真实头像。
- **订阅推送**：设置里关注博主 + 间隔，后台定时「真人式」逐个打开媒体页自动推送；
  「最近推送」记录（博主 + 新下载数 + 相对时间）；下载完成桌面通知。
- **日期区间过滤**：下载设置「日期范围」（不限 / 7 / 30 / 90 天），批量下载只下最近
  N 天发布的媒体。

### 修复

- **图片下载空白**：图片改为 `chrome.downloads` 按 URL 直下（不再经后台抓取字节，
  规避 twimg 空白/占位内容）；后台回传 fileSize，历史「总体积」计入图片体积。
- **视频下载**：注入脚本拦截 GraphQL 响应提取真实 mp4（video.twimg.com CORS 开放），
  MSE blob 视频据此换成直链下载。
- **页内按钮白屏 / 漂移**：重写为事件委托 + 单一 fixed 按钮（不往 React 节点插入
  元素）；rAF 逐帧跟随 + 媒体指纹防虚拟列表复用漂移 + 滚出视口隐藏；修 display
  `!important` 优先级导致按钮无法隐藏的问题。
- **API 模式失效**：X 媒体时间线请求改走 XHR 且需 `x-twitter-active-user` /
  `x-twitter-auth-type` 头；改为注入脚本 fetch/XHR 双路拦截模板（不再依赖
  performance 资源计时），并修正 429/错误被吞的问题。

## v7.4 新功能

- **设置中心**（面板齿轮 / `#xmd-settings` 深链）：
  - 文件命名令牌模板：`{user} {date} {time} {seq} {id} {month}`，三个预设
    （纯时间 / 博主+时间 / 博主+时间+ID）+ 自定义 + 实时预览；
  - 文件夹策略：不建 / 按博主 / 按月份 / 博主+月份 / 自定义模板（`/` 分层）；
  - 页内按钮：启用、仅悬停显示、视频也显示、右键菜单、点击行为（直下/入队）；
  - 下载：跳过已下载、失败重试、并发数 1/3/5。
  - 设置存 `chrome.storage.local`，跨会话持久化。
- **页内 hover 下载按钮**：每条推文图片/视频右上角圆形按钮，悬停显示，
  点击按设置直接下载或加入队列；MutationObserver 注入，幂等防重复。
- **右键菜单**「用 X Media 下载此图片」。
- **按天计数 `{seq}`**：序号 = 同目录内同博文发布日的持久化计数 +1，
  跨会话不重名；批量下载从已有计数续编。
- **chrome.downloads 子目录回退**：未选文件夹时也能在下载目录自动建子目录
  （manifest 增加 `storage / downloads / contextMenus` 权限）。

## v7.3.1 修复记录

- **面板样式丢失（根因：`?inline` 冻结 Tailwind 扫描）**：Vite 的 `?inline` CSS
  导入会在首次 transform 时冻结编译结果，后续扫描到的候选类进不来，导致大量
  工具类缺失、面板渲染成"黑块"。改为副作用导入产出 `styles.css` 资产，内容脚本
  运行时 `fetch(chrome.runtime.getURL("styles.css"))` 注入 Shadow Root。
- **Shadow DOM 内 `@property` 被忽略**：Tailwind v4 的 border/shadow 工具类依赖
  `@property` 注册的 `--tw-*` 变量，Shadow Root 内不生效。styles.css 增加层外
  兜底规则（`#xmd-root [class~="border"]` 等）显式补上 border-style/width 与阴影。
- **点击扩展图标无反应**：manifest 增加 `action`，后台 `chrome.action.onClicked`
  发消息，内容脚本收到后展开面板。
- **内联按钮被 X 页面样式覆盖**（变成蓝色圆钮/文字被裁）：内联按钮样式全部加
  `!important` 压过页面样式表。
- **HoldActionButton 尺寸失控**（默认 h-16 min-w-72 的大黑块）：覆盖为
  `h-8 min-w-0 rounded-lg px-3` 的紧凑尺寸。

## 常见问题

- **面板没出现**：确认加载的是 `dist/` 目录且已构建到最新；刷新页面。
- **下载失败**：卡片显示红色 `!`；自动重试一次后回退浏览器下载通道。
- **API 提示 429**：触发限频，稍后再试或改用「自动加载」。
- **样式异常**：面板在 Shadow DOM 内，不受页面主题/插件样式影响；如仍异常请反馈。
