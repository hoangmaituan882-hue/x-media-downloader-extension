/**
 * Transitions.dev Pattern 29: Fly-to-Orb / Fly-to-Cart
 * 当用户在推文流或面板内点击下载时，从点击位置发射一枚带有微缩图的微光流星，
 * 划出贝塞尔抛物线飞入右上角悬浮球，并在落点触发果冻回弹冲击波。
 */

export interface FlyToOrbOptions {
  /** 起点元素的边界矩形 (或点击坐标) */
  startRect: DOMRect | { left: number; top: number; width: number; height: number };
  /** 缩略图 URL */
  thumbnail?: string;
}

export function flyToOrb({ startRect, thumbnail }: FlyToOrbOptions) {
  try {
    // 1. 定位终点坐标 (优先寻找当前悬浮球或面板图标)
    let endX = window.innerWidth - 34;
    let endY = 34;

    const host = document.getElementById("xmd-root");
    if (host?.shadowRoot) {
      const orb = host.shadowRoot.querySelector(
        'button[aria-label="展开 X Media Downloader 面板"], .xm-top, [data-xmd-target="orb"]',
      );
      if (orb) {
        const r = orb.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          endX = r.left + r.width / 2;
          endY = r.top + r.height / 2;
        }
      }
    }

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;

    // 2. 创建飞行微粒
    const particle = document.createElement("div");
    particle.className = "xmd-flying-orb-particle";

    Object.assign(particle.style, {
      position: "fixed",
      left: `${startX}px`,
      top: `${startY}px`,
      width: "28px",
      height: "28px",
      marginLeft: "-14px",
      marginTop: "-14px",
      borderRadius: "50%",
      zIndex: "2147483640",
      pointerEvents: "none",
      overflow: "hidden",
      boxShadow: "0 4px 16px rgba(0, 83, 227, 0.45), 0 0 0 2px rgba(255, 255, 255, 0.9)",
      background: "#0f1419",
      transformOrigin: "center center",
      willChange: "transform, opacity",
    });

    if (thumbnail) {
      const img = document.createElement("img");
      img.src = thumbnail;
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      });
      particle.appendChild(img);
    } else {
      // 默认矢量光斑
      particle.style.background = "linear-gradient(135deg, #3b82f6, #8b5cf6)";
    }

    document.body.appendChild(particle);

    // 3. 计算抛物线位移 (先略微向上隆起，再平滑俯冲至终点)
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const arcHeight = Math.min(Math.abs(deltaX) * 0.25, 80);

    const keyframes: Keyframe[] = [
      {
        transform: "translate(0px, 0px) scale(1)",
        opacity: 0.95,
      },
      {
        transform: `translate(${deltaX * 0.45}px, ${deltaY * 0.35 - arcHeight}px) scale(0.85)`,
        opacity: 1,
        offset: 0.45,
      },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(0.28)`,
        opacity: 0.15,
        offset: 0.95,
      },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(0.1)`,
        opacity: 0,
      },
    ];

    const anim = particle.animate(keyframes, {
      duration: 480,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    });

    anim.onfinish = () => {
      particle.remove();
      // 4. 触发悬浮球冲击回弹自定义事件
      window.dispatchEvent(
        new CustomEvent("xmd-orb-impact", {
          detail: { x: endX, y: endY },
        }),
      );
    };
  } catch {
    // 宽容失败
  }
}
