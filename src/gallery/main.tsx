import { createRoot } from "react-dom/client";
import "./gallery.css";
import { Gallery } from "./Gallery";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { initStores } from "@/core/store";

(async () => {
  await initStores();
  const user = new URLSearchParams(location.search).get("user") || "";
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary label="画廊">
      <Gallery user={user} />
    </ErrorBoundary>,
  );
})();
