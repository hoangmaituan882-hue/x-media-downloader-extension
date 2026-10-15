import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

type Point = { clientX: number; clientY: number };

function containsPoint(rect: DOMRect | null | undefined, point: Point): boolean {
  return !!rect && point.clientX >= rect.left && point.clientX <= rect.right &&
    point.clientY >= rect.top && point.clientY <= rect.bottom;
}

/** Portal 遮罩和共享元素动画会改变命中目标，不能把这些 pointerleave 当作真实离开。 */
export function useHoverPreview<T>(beforeClose?: (item: T) => void) {
  const [item, setItem] = useState<T | null>(null);
  const current = useRef<T | null>(null);
  const sourceRect = useRef<DOMRect | null>(null);
  const dismissedRect = useRef<DOMRect | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const beforeCloseRef = useRef(beforeClose);
  beforeCloseRef.current = beforeClose;

  const cancelOpen = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    openTimer.current = null;
  }, []);
  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const close = useCallback(() => {
    cancelOpen();
    cancelClose();
    const previous = current.current;
    current.current = null;
    sourceRect.current = null;
    if (previous !== null) beforeCloseRef.current?.(previous);
    setItem(null);
  }, [cancelOpen, cancelClose]);

  const open = useCallback((value: T, anchor: HTMLElement) => {
    cancelOpen();
    cancelClose();
    dismissedRect.current = null;
    // 记住动画开始前的缩略图区域，避免跟随共享元素自身移动的边界。
    sourceRect.current = anchor.getBoundingClientRect();
    current.current = value;
    setItem(value);
  }, [cancelOpen, cancelClose]);
  const enter = useCallback((value: T, event: PointerEvent<HTMLElement>) => {
    // 主动关闭后，回飞动画会让原缩略图再次命中鼠标；需先真正移出才重新响应。
    if (containsPoint(dismissedRect.current, event)) return;
    dismissedRect.current = null;
    cancelOpen();
    cancelClose();
    const anchor = event.currentTarget;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      if (anchor.isConnected) open(value, anchor);
    }, 180);
  }, [cancelOpen, cancelClose, open]);

  const trackPointer = useCallback((point: Point) => {
    if (!containsPoint(dismissedRect.current, point)) dismissedRect.current = null;
    if (current.current === null) return;
    if (containsPoint(sourceRect.current, point) || containsPoint(previewRef.current?.getBoundingClientRect(), point)) {
      cancelClose();
    } else if (closeTimer.current === null) {
      closeTimer.current = window.setTimeout(close, 120);
    }
  }, [cancelClose, close]);
  const leave = useCallback((event: PointerEvent<HTMLElement>) => {
    cancelOpen();
    trackPointer(event);
  }, [cancelOpen, trackPointer]);
  const dismiss = useCallback((point: Point) => {
    dismissedRect.current = containsPoint(sourceRect.current, point) ? sourceRect.current : null;
    close();
  }, [close]);

  useEffect(() => () => { cancelOpen(); cancelClose(); }, [cancelOpen, cancelClose]);
  return { item, previewRef, open, close, dismiss, enter, leave, trackPointer, cancelClose };
}
