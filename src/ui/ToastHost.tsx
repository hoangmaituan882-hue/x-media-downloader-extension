import { AnimatedToastStack, type AnimatedToast, type ToastStatus } from "@/components/motion/animated-toast-stack";
import { useXmd } from "@/core/engine";
import type { ToastKind } from "@/core/types";

const KIND_TO_STATUS: Record<ToastKind, ToastStatus> = {
  info: "info",
  success: "success",
  warning: "info",
  error: "error",
};

/** beUI 动画 Toast 栈；portalRoot 指向 Shadow Root，保证样式隔离生效 */
export function ToastHost({ portalRoot }: { portalRoot: Element | null }) {
  const toasts = useXmd(s => s.toasts);
  const dismissToast = useXmd(s => s.dismissToast);

  const mapped: AnimatedToast[] = toasts.map(t => ({
    id: t.id,
    title: t.text,
    status: KIND_TO_STATUS[t.kind],
    createdAt: t.created,
    duration: 4000,
  }));

  return (
    <AnimatedToastStack
      toasts={mapped}
      onDismiss={dismissToast}
      position="bottom-center"
      placement="fixed"
      portal
      portalRoot={portalRoot}
      maxVisible={3}
    />
  );
}
