# AGENTS.md — X Media Downloader 扩展

给在本仓库工作的 AI agent / 开发者的项目说明书。读完再动手。

## 项目一句话

X (Twitter) 媒体批量下载的 Chrome/Edge 扩展（Manifest V3）：面板三视图（主/设置/历史）+ 博主主页悬浮卡 + 页内注入按钮，支持扫描/自动滚动/GraphQL API 三种采集、按天命名、增量备份、推送下载（进相册→加载全部→全部下载）。

## 目录与职责

```
├── extension/            静态扩展文件，构建时拷入 dist/
│   ├── manifest.json     MV3 清单（permissions: storage/downloads/contextMenus/notifications/alarms/tabs）
│   ├── background.js     Service Worker：下载代理（绕 CORS）、右键菜单、扩展图标唤起、订阅推送定时访问、桌面通知、图片下载 fileSize 回传
│   └── icons/
├── dist/                 构建产物 = 加载为「已解压扩展」的目录（emptyOutDir 会清空！）
├── src/
│   ├── content.tsx       入口：Shadow 宿主创建、样式 fetch 注入、主题轮询、推送意图 boot 钩子
│   ├── styles.css        全部 UI 样式（Tailwind v4 + 作用域自定义 + 暗黑覆盖），见「样式约定」
│   ├── core/
│   │   ├── engine.ts     zustand store：只留状态 + UI 级动作，组合 actions 工厂
│   │   ├── actions/      shared.ts（助手/CONFIG）· download.ts · push.ts
│   │   ├── api.ts        UserMedia GraphQL：injected.js fetch/XHR 拦截模板 + PerformanceObserver 兜底（不硬编码 queryId）
│   │   ├── downloader.ts 三通道：FS API 多级目录 → chrome.downloads → blob/<a> 兜底
│   │   ├── history.ts    富记录（上限 2000）+ 统计（perDay/perUser/recordsForDay/dayLabel）
│   │   ├── store.ts      downloaded_v1 去重库 + seq 按天计数库（localStorage）
│   │   ├── naming.ts     令牌模板 {user}{date}{time}{seq}{id}{month} + 分组重编号
│   │   ├── scanner.ts    DOM 媒体扫描 + extractTweetMeta/extractTweetTime
│   │   ├── profile.ts    博主信息 DOM 抓取（名字/认证/帖子数，宽容失败）
│   │   ├── page.ts       页面上下文（profile_media/home/single_tweet/other）+ 滚动
│   │   ├── settings.ts   设置 schema/默认值/合并/持久化（chrome.storage.local）
│   │   ├── theme.ts      detectTheme（body/html 亮度）+ applyThemeClass（html.xmd-dark）
│   │   └── types.ts / single-types.ts / utils.ts
│   ├── ui/               App（拖拽+折叠+logo 飞行）· Panel · SettingsView（手风琴）·
│   │                     HistoryView（日柱过滤+手风琴下钻+预览 morph）· Grid（stagger+骨架）·
│   │                     FloatCard（悬浮卡）· ToastHost · Tooltip · inline.ts（资料页内联钮）·
│   │                     injector.ts（hover 下载钮）· context.tsx（PortalRootContext）
│   │   ├── anim/         下载动画系统（设置 anim.enabled 开关 + theme 选择）
│   │   │   ├── index.tsx        DownloadAnim 宿主（顶栏计数 + 主题渲染 + 停止）
│   │   │   ├── themes.ts        主题注册表：新增主题 = 加记录 + 组件文件
│   │   │   ├── DotcutTheme.tsx  主题「蚀刻点阵」：dotcut 网格 + 底部跑马灯
│   │   │   ├── MarqueeTheme.tsx 主题「跑马灯画廊」：大计数 + 三行反向跑马灯
│   │   │   ├── ProgressMarquee.tsx 共享跑马灯条（rAF 滚动，done 媒体流入）
│   │   │   └── dotcut/          canvas 引擎（engine/scenes，look 四轴编排）
│   ├── components/motion/  vendored beUI 组件（MIT，见 ATTRIBUTION.md）：button/stateful、switch、
│   │                     tabs、input、loader、number-ticker、hold-action-button、tooltip、
│   │                     animated-toast-stack + lib/(ease/touch/hooks)
│   └── lib/              cn()（clsx+tailwind-merge）等
├── vite.config.ts        lib 模式 IIFE 单文件 + closeBundle 拷静态文件
└── package.json / tsconfig.json
```

## 构建与验证

```bash
npm install
npm run build        # 产出 dist/（content.js IIFE + styles.css + 静态拷贝）
npx tsc --noEmit     # 类型检查必须零错误
```

> ⚠️ **改完任何源码后，必须 `npm run build` 重建 `dist/`** —— 浏览器加载的是 `dist/`，
> 不是 `src/`。只改源码不构建 = 白改，刷新页面看不到任何变化。

> ⚠️ **`npm run build` 不做类型检查**。vite 只打包不校验 TS 类型，类型错误也能出包。
> 提交前务必单独跑 `npx tsc --noEmit`，必须零错误。

- 加载方式：`chrome://extensions` → 开发者模式 → 加载已解压扩展 → 选 **dist/**
- **改动生效三步（缺一不可）**：① `npm run build` → ② chrome://extensions 点扩展「重新加载」→ ③ 刷新 x.com 页面
- 媒体视图切换回归：`npm run test:media-views`（使用已安装的 Microsoft Edge，无头运行；详见 `tests/README.md`）。其他 UI 可用本地静态服务器（dist 回退 test.html，`.css`→styles.css、`.js`→content.js）+ 浏览器截图验证。注意 `npm run build` 的 emptyOutDir 会删掉 dist/test.html，测试页要在 build **之后**创建。
- 核心下载回归：`npm test`；真实扩展通道回归：构建后运行 `npm run test:extension`（隔离的 Edge 配置，不访问 X 账号；详见 `tests/README.md`）。
- 发布安装包：`npm run package:extension` 生成 `release/v版本号/X-Media-Downloader/` 和 ZIP（附离线安装说明）；再运行 `npm run test:package` 验证解压后的实际扩展。
- 页内下载按钮及已下载标记回归：`npm run test:inline-media`（真实播放的视频与播放器覆盖层、本地模拟下载完成、四视图及减少动效偏好）。
- 悬停大图稳定性回归：`npm run test:hover-preview`（鼠标静止逐帧采样、缩略图到大图移入移出、历史页、主动关闭及切换视图）。
- 深链调试：`#xmd-settings` / `#xmd-history` 直接打开对应视图。
- **Motion 类型坑**：给 `motion.div` 的 `variants` 传对象字面量时，`transition.type: "spring"` 会被推断成 `string` 导致 tsc 报 TS2322；给 variants 常量加显式 `: Variants` 类型标注（`import { type Variants } from "motion/react"`）。

## 架构约定（必须遵守）

1. **UI 全部在 Shadow Root 内**（样式隔离）。styles.css 用副作用导入产出独立资产，content.tsx 运行时 `fetch` 注入 shadow。**禁止用 `?inline` 导入 CSS**——Vite 的 ?inline 会冻结 Tailwind 扫描结果，丢工具类（历史事故）。
2. **Shadow DOM 内 `@property` 被浏览器忽略**：Tailwind v4 的 translate/scale/shadow 等依赖 `--tw-*` 注册变量。styles.css 顶部 `@layer xmd-shadow-fallback` 提供变量默认值兜底，新增依赖变量的工具类时确认该层覆盖。
3. **fixed 浮层必须 portal 出面板**：面板 motion.div 有 transform（fixed 的 containing block）+ overflow:hidden，预览遮罩等 fixed 元素用 `createPortal(..., PortalRootContext)` 提升到 shadow 根。
4. **层外 CSS 覆盖层内工具类**：暗黑模式对 tailwind 字面色（bg-white/text-zinc-* 等）用 `#xmd-root [class~="..."]` 层外规则覆盖；shadow 外（portal/页内注入）用无前缀类或 `:host([data-theme="dark"])` / `html.xmd-dark`。
5. **暗黑三通道**：root/host `data-theme`（shadow 内）、`html.xmd-dark`（页内注入钮）、beUI 走 CSS 变量覆盖。主题检测在 theme.ts，3s 轮询。
6. **beUI 组件是 vendored 源码**：可直接改（如 tooltip 的 portalRoot、适配），改了在 ATTRIBUTION.md 记一笔；不要 npm 升级覆盖。
7. **状态在 engine.ts，动作在 actions/**：store 只留状态字段 + UI 级动作；下载/推送逻辑放 actions/{download,push}.ts，共用助手在 actions/shared.ts。工厂签名 `(set, get, helpers)`，类型 `import type` 避免循环。
8. **命名/计数**：文件名一律走 naming.ts 令牌模板；`{seq}` = 同目录同发布日的持久化计数（store.ts seq 库），跨会话不重名。历史/去重/计数三库都在 localStorage，改结构时写迁移。
9. **API 模式不硬编码 queryId**：injected.js 拦截 X 客户端 fetch/XHR，命中 UserMedia/UserVideoTimeline 时派发 `xmd-api-template` 事件喂给 api.ts 的模板缓存；PerformanceObserver（resource timing）+ performance 条目兜底首屏。queryId 随 X 发版漂移，硬编码必死。
10. **推送下载跨跳转**：意图存 `sessionStorage["xmd_push"]`，content.tsx boot 时匹配媒体页后自动跑管线。

## 动效语言（保持一致 · 融合 transitions.dev 规范）

本项目动效融合 **beUI 弹簧物理** 与 **transitions.dev 五维 Motion Tokens**，相关技能规范已收录于 `.agents/skills/transitions-dev/` 与 `.agents/skills/transitions-polish/`。

### 1. 核心曲线与时间体系（lib/ease.ts & styles.css）
- **缓动统一**：
  - 平滑减速（入场/展开/位移）：`EASE_SMOOTH_OUT = [0.22, 1, 0.36, 1]` / `EASE_OUT = [0.16, 1, 0.3, 1]`
  - 弹性回弹（角标/完成勾选/pop-in）：`EASE_BOUNCE = [0.34, 1.36, 0.64, 1]`
  - 抽屉与大面板：`EASE_DRAWER = [0.32, 0.72, 0, 1]`
- **五阶时长标准 (Duration Tokens)**：
  - `stagger: 40ms`（批量网格/列表级联间隔）
  - `micro: 80ms`（微交互、触控反馈、抖动分段）
  - `quick: 150ms`（关闭、折叠、退出、hover 移出、文本切换）
  - `fast: 250ms`（模态打开、下拉展开、Tab 滑动、Toast 打开、标准弹窗）
  - `medium: 350ms`（面板大幅滑动、复杂卡片 morph）
  - `slow / very-slow: 400~500ms`（全量场景转换、庆祝式成功徽标）
- **位移与比例 (Distance & Scale)**：
  - 位移与频率成反比：文本切换 `4px`，小震颤 `6px`，卡片与页面微移 `8px`，大面板 `12~30px`。
  - 缩放基准：微缩放 `0.98`，弹窗/卡片基准 `0.95~0.97`，轻微超弹 `1.05`。

### 2. 交互过渡设计法则
- **开闭不对称原则 (Open/Close Asymmetry)**：打开动作要平滑自然（250~350ms，smooth-out），关闭动作必须干脆利落（150~200ms），绝不让用户等待界面退场。
- **共享元素与布局让位**：共享元素用 `layoutId`（logo 飞行、视图指示点、缩略图→预览 morph）；高度/位置让位用 `layout`（手风琴、博主榜）。
- **批量入场 Stagger**：批量卡片加载入场延迟统一为 `min(index * 0.02, 0.5)` + 骨架屏 shimmer。
- **严禁 `transition: all`**：必须显式声明过渡属性（如 `transform, opacity, height, background-color`），降低合成层重绘开销。
- **无障碍适配**：媒体查询 `@media (prefers-reduced-motion: reduce)` 下强制将过渡时间降为 0 或直接隐藏位移。
- **破坏性操作**：统一使用 HoldActionButton 长按确认，不用 `confirm()`。

### 3. 组件参考模版（.agents/skills/transitions-dev/）
库中收录 35+ 种标准交互模版（如 `01-card-resize`、`04-text-states-swap`、`06-modal`、`10-success-check`、`21-accordion`、`22-toast` 等），编写新动画或微调组件时应直接参照对应方案。

## UI 约定

- 密度优先：面板 360px、三行信息卡、手风琴设置、5 列网格；滚动条平时隐藏 hover 显 4px 细条
- 明暗双主题全覆盖（新 UI 必须同时写暗色变体）
- 图标按钮必须有 aria-label + Tooltip
- 灰度抗锯齿已全局开启（antialiased）

## 常见坑（历史事故簿）

- Tailwind v4 important 是后缀 `bg-red-600!`（v3 前缀写法无效）；优先用层外覆盖而非 important
- Windows + Git Bash：`taskkill //PID <pid> //F`；端口占用先 netstat 查杀；curl 偶发吊销检查失败加 `--ssl-no-revoke`
- 截图坐标 ≈ CSS 像素 × 1.097（IAB 缩放），点击测试要换算
- X 头部 DOM 晚于路由渲染：scrapeProfile 需重试（700ms×5）
- 短视口（<700px）面板与悬浮卡重叠：悬浮卡自动左移（float-left）
- 页内 hover 按钮样式表有 `display:flex !important`，隐藏按钮必须 `btn.style.setProperty("display","none","important")`（普通 `style.display="none"` 压不过 !important，按钮永远显示）

## 路线图

- [x] 订阅推送 v2：关注列表 + chrome.alarms 后台定时检查 + 桌面通知 + 结果记录 + 最近推送展示
- [x] 媒体过滤器 · 日期区间：批量下载只下最近 N 天发布的媒体（分辨率过滤暂不实现——X 视频变体无 width/height 字段，只有 bitrate）
- [ ] 多博主队列批量推送（订阅推送已覆盖定时轮转，此项价值降低，可选）
