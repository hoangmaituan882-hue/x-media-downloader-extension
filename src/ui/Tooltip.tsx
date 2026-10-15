import { Tooltip, type TooltipProps } from "@/components/motion/tooltip";
import { usePortalRoot } from "./context";

/** beUI Tooltip 的项目封装：自动把浮层 portal 指向 Shadow Root */
export function XmdTooltip(props: Omit<TooltipProps, "portalRoot">) {
  const root = usePortalRoot();
  return <Tooltip {...props} portalRoot={root} />;
}
