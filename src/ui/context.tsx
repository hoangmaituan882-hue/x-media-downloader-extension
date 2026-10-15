import { createContext, useContext } from "react";

/**
 * Shadow Root 引用上下文。
 * 需要 portal 的悬浮层组件（Tooltip/Toast）从这里取挂载点，
 * 保证浮层留在 Shadow DOM 内、样式隔离生效。
 */
export const PortalRootContext = createContext<Element | DocumentFragment | null>(null);

export function usePortalRoot() {
  return useContext(PortalRootContext);
}
