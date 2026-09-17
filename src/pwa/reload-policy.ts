/**
 * Whether a controllerchange event should reload the page.
 *
 * Extracted so the decision is testable on its own. It went wrong once in a
 * way tests could not see: the worker activated, the page did not reload, and
 * the app ran a new worker against an old document.
 */
export function shouldReloadOnControllerChange(state: {
  /** Was this page already under a service worker when we registered? */
  readonly wasControlled: boolean;
  /** Has a reload already been started by a previous event? */
  readonly reloading: boolean;
}): boolean {
  // A first install also fires controllerchange when clientsClaim() takes
  // over the page. Reloading there would restart the app during someone's
  // first visit for no reason.
  if (!state.wasControlled) return false;

  // Some browsers fire the event more than once; reloading twice is a loop.
  if (state.reloading) return false;

  return true;
}
