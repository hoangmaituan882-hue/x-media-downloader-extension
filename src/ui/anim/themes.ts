// 下载动画主题注册表：新增主题 = 加一条记录 + 组件文件。

import type { AnimThemeId } from "@/core/settings";
import { DotcutTheme } from "./DotcutTheme";
import { MarqueeTheme } from "./MarqueeTheme";
import { MatrixTheme } from "./MatrixTheme";

export interface AnimThemeDef {
  id: AnimThemeId;
  name: string;
  C: (props: { stopping?: boolean }) => React.JSX.Element;
}

export const ANIM_THEMES: AnimThemeDef[] = [
  { id: "dotcut", name: "蚀刻点阵", C: DotcutTheme },
  { id: "marquee", name: "跑马灯画廊", C: MarqueeTheme },
  { id: "matrix", name: "矩阵代码雨", C: MatrixTheme },
];
