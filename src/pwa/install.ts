/**
 * Install affordance state.
 *
 * `beforeinstallprompt` fires once, early, and Chrome fires it whether or not
 * anything is listening — an event captured only after React has mounted is a
 * race this loses on a slow first render. So the listener is installed from the
 * module's top level, before the app renders, and the event is parked here for
 * a component to collect later. This is the documented pattern and the reason
 * this is a module rather than a hook.
 */

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = { readonly canPrompt: boolean; readonly installed: boolean };

let deferred: InstallEvent | undefined;
let installed = false;

/**
 * The snapshot object is cached and only replaced when the values actually
 * change. useSyncExternalStore compares snapshots by identity, so returning a
 * freshly built object each call is an infinite render loop — React 19 throws
 * "Maximum update depth exceeded" and the whole app white-screens. It did
 * exactly that here, and only the built bundle showed it.
 */
let snapshot: InstallState = { canPrompt: false, installed: false };

const listeners = new Set<() => void>();

function announce() {
  const next = { canPrompt: deferred !== undefined, installed };
  if (next.canPrompt === snapshot.canPrompt && next.installed === snapshot.installed) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function watchInstallability(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome shows its own omnibox affordance regardless; preventing the
    // default only stops the mini-infobar on Android, which we replace with a
    // control in the app's own chrome.
    event.preventDefault();
    deferred = event as InstallEvent;
    announce();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = undefined;
    announce();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallState(): InstallState {
  return snapshot;
}

/** Test seam: drops any captured event and resets the cached snapshot. */
export function resetInstallState(): void {
  deferred = undefined;
  installed = false;
  snapshot = { canPrompt: false, installed: false };
}

/**
 * Returns what the person chose, so the caller can stop offering something
 * they declined. The event is single-use: Chrome will not let the same one be
 * prompted twice, so it is dropped either way.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = undefined;
  announce();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

/** True when the app is running as an installed app rather than in a tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  // iOS never implemented display-mode for home-screen apps and uses this
  // non-standard flag instead.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iOS supports installing but offers no programmatic prompt and no omnibox
 * affordance — the only route is Share, then Add to Home Screen. A button that
 * silently does nothing there is worse than no button, so the UI needs to know
 * when to show instructions instead.
 */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Chrome and Firefox on iOS are Safari underneath but expose their own
  // share sheets; the instruction wording stays the same either way.
  return iOS && /WebKit/.test(ua) && !/Edg\//.test(ua);
}

/**
 * Whether this same app is already installed on the device.
 *
 * Needs `related_applications` in the manifest pointing at the manifest
 * itself, which is how Chrome lets a page ask about its own installation.
 * Unsupported everywhere else, where it answers "don't know" rather than
 * "no" — the caller must treat undefined as unknown, not as not-installed.
 */
export async function isAlreadyInstalled(): Promise<boolean | undefined> {
  type WithRelated = Navigator & {
    getInstalledRelatedApps?: () => Promise<{ platform: string; url?: string }[]>;
  };
  const query = (navigator as WithRelated).getInstalledRelatedApps;
  if (typeof query !== "function") return undefined;
  try {
    const apps = await query.call(navigator);
    return apps.some((app) => app.platform === "webapp");
  } catch {
    return undefined;
  }
}
