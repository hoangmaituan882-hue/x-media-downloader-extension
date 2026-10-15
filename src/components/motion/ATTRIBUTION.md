# beUI components

本目录下的组件源码来自 [beUI v2](https://github.com/starc007/ui-components)
（作者 Saurabh Chauhan，MIT License），通过其 shadcn registry 的
“复制源码”方式引入，并按本项目需求做了少量适配（如去除 magnetic 按钮）。

原始项目：https://github.com/starc007/ui-components · https://beui.dev

## 本项目所做的适配

- `button/index.ts`：移除 MagneticButton（悬停磁吸不适用于扩展面板）
- `tooltip.tsx`：新增可选 `portalRoot` 属性，浮层可 portal 到 Shadow Root；根据 transitions.dev 规范优化了微缩放（0.97）、意图延迟（80ms）与微模糊（2px）。
