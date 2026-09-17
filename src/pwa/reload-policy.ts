/**
 * Whether a `controllerchange` event should reload the page.
 *
 * Extracted so the decision is testable on its own, and it has now been wrong
 * twice in the same direction — both times leaving an operator looking at a
 * prompt that did nothing.
 *
 * The first version reloaded on every `controllerchange`, which also fires when
 * `clientsClaim()` takes over on a first install, restarting the app during
 * someone's first visit.
 *
 * The second version fixed that by only reloading when the page was already
 * controlled at registration time — and broke the case it was written for. On
 * a first visit the worker claims the page *after* the effect has run, so
 * `wasControlled` is false for the rest of that page's life. The operator who
 * opens the console, leaves the tab open, and is later offered an update then
 * clicks Reload and watches nothing happen. Locally the plugin's own reload
 * masked it; the Linux CI runner, where that did not fire, is what exposed it.
 *
 * So the deciding fact is not what the page looked like at registration. It is
 * whether this page asked for the update.
 */
export function shouldReloadOnControllerChange(state: {
  /** Has this page asked the waiting worker to take over? */
  readonly updateRequested: boolean;
  /** Was this page already under a service worker when we registered? */
  readonly wasControlled: boolean;
  /** Has a reload already been started by a previous event? */
  readonly reloading: boolean;
}): boolean {
  // Some browsers fire the event more than once; reloading twice is a loop.
  if (state.reloading) return false;

  // The operator clicked Reload. Whatever the page looked like an hour ago,
  // this controller change is the one they asked for.
  if (state.updateRequested) return true;

  // Otherwise only reload if a worker was already in charge — which rules out
  // the first-install claim, where a reload would be a restart for no reason.
  return state.wasControlled;
}
