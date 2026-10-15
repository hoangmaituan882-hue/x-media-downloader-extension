// Shared motion tokens. Easing curves mirror the CSS custom properties in
// styles.css; springs are the canonical physics used across components.
// Strong custom variants — defaults like `ease-in`/`ease-out` feel weak.
//
// ── Transitions.dev Motion Token Scale ──────────────────────────────
// Aligned with transitions.dev 5-dimension token system (Duration, Easing, Distance, Scale, Blur).

/** Primary smooth-out curve from transitions.dev: fast initial velocity, soft settle. */
export const EASE_SMOOTH_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
/** Playful overshoot curve for badges, pop-ins and completion marks. */
export const EASE_BOUNCE = [0.34, 1.36, 0.64, 1] as const;
export const EASE_BOUNCE_STRONG = [0.34, 3.85, 0.64, 1] as const;

/** CSS string form of easing curves for inline style transitions. */
export const EASE_SMOOTH_OUT_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_OUT_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EASE_BOUNCE_CSS = "cubic-bezier(0.34, 1.36, 0.64, 1)";

// ── Duration Tokens (in seconds, for Motion / Framer Motion props) ──
/** 40ms: per-item cascade in staggered groups. */
export const DURATION_STAGGER = 0.04;
/** 80ms: micro feedback (checkbox check, button state ripple). */
export const DURATION_MICRO = 0.08;
/** 150ms: fast exits, dismissals, hover release, close transitions. */
export const DURATION_QUICK = 0.15;
/** 250ms: standard UI entrances (dialog, popover, tab glide, toast open). */
export const DURATION_FAST = 0.25;
/** 350ms: rich reveals, large panel slides, drawer open. */
export const DURATION_MEDIUM = 0.35;
/** 400ms: prominent hero element entrances. */
export const DURATION_SLOW = 0.40;
/** 500ms: full page context switches. */
export const DURATION_VERY_SLOW = 0.50;

// ── Distance Tokens (in px, travel distance scales down with frequency) ──
export const DISTANCE_MICRO = 4;
export const DISTANCE_SMALL = 6;
export const DISTANCE_BASE = 8;
export const DISTANCE_MEDIUM = 12;
export const DISTANCE_LARGE = 30;

// ── Scale Tokens ──
export const SCALE_SUBTLE = 0.98;
export const SCALE_BASE = 0.95;
export const SCALE_DEEP = 0.90;
export const SCALE_POP = 1.05;

/** Press feedback on buttons and other tappable surfaces. */
export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;

/** Content swaps — label/icon slots trading places inside a control. */
export const SPRING_SWAP = {
  type: "spring",
  stiffness: 460,
  damping: 30,
  mass: 0.55,
} as const;

/** Overlay panel entrances — modals and sheets summoned by pointer. */
export const SPRING_PANEL = {
  type: "spring",
  stiffness: 420,
  damping: 40,
  mass: 0.5,
} as const;

/** Shared-layout glides — pills, indicators and panels morphing between positions. */
export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 480,
  damping: 36,
  mass: 0.5,
} as const;

/** Cursor-follow physics for decorative mouse tracking (magnetic, tilt, dock). */
export const SPRING_MOUSE = {
  stiffness: 200,
  damping: 15,
  mass: 0.3,
} as const;

/** Dragged handles and fills (sliders) — critically damped `useSpring` config,
 * so the value follows the pointer butterily and never rebounds off an end. */
export const SPRING_GLIDE = {
  stiffness: 700,
  damping: 50,
  mass: 0.5,
} as const;
