import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/** How often to ask the browser whether a new build exists. */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Registers the service worker and reports when a new build is waiting.
 *
 * The update is never applied automatically. skipWaiting swaps the controlling
 * worker under a running page that still holds references to the previous
 * build's chunk filenames; the next lazy route import then 404s and the page
 * goes blank — for exactly the operators who were mid-task.
 */
export function useServiceWorker(): { updateReady: boolean; applyUpdate: () => void } {
  const [updateReady, setUpdateReady] = useState(false);
  const [update, setUpdate] = useState<{ run: () => Promise<void> } | undefined>();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cleanup: (() => void) | undefined;

    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
        // Messages the waiting worker to skip waiting; workbox-window then
        // reloads the page once it takes control, guarded by its own isUpdate
        // flag so the reload happens exactly once. The function's boolean
        // parameter has been ignored since plugin 0.13.2, so it is not passed.
        setUpdate({ run: () => updateSW() });
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;

        // GitHub Pages serves everything with max-age=600 and that cannot be
        // changed, so an update can never propagate faster than ten minutes.
        // The browser's own check is every 24 hours, far too slow for an
        // operator console, so check hourly and whenever the tab is shown.
        const check = () => {
          if (document.visibilityState === "visible") void registration.update();
        };

        const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL);
        document.addEventListener("visibilitychange", check);

        cleanup = () => {
          window.clearInterval(timer);
          document.removeEventListener("visibilitychange", check);
        };
      },
    });

    return () => cleanup?.();
  }, []);

  return {
    updateReady,
    applyUpdate: () => {
      void update?.run();
    },
  };
}
