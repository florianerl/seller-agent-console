import type { ActorKind, OrderStatus } from "./vocabulary";

/**
 * The order state machine's move table, so the Orders screen can offer the
 * legal next steps as buttons instead of asking for a status by name.
 *
 * A copy of `_DEFAULT_TRANSITIONS` in models/order_state_machine.py (seller
 * agent 938f7ea), descriptions verbatim. It is a copy and not a contract: the
 * agent exposes no "allowed next" read, only `allowed_next` on a transition
 * response and `allowed_transitions` on a 409 body. Mirroring it is sound
 * today because `transition_order` rebuilds every machine with the default
 * rules (services/order_service.py), so there is no per-order variation to
 * miss. If upstream edits the table, a button here draws a 409 and nothing
 * moves — the screen says so and re-reads the order.
 */
export const ORDER_TRANSITIONS: readonly {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly description: string;
}[] = [
  // Happy path
  { from: "draft", to: "submitted", description: "Order submitted for review" },
  { from: "submitted", to: "pending_approval", description: "Awaiting human approval" },
  { from: "submitted", to: "approved", description: "Auto-approved (no gate)" },
  { from: "pending_approval", to: "approved", description: "Human approved" },
  { from: "pending_approval", to: "rejected", description: "Human rejected" },
  { from: "approved", to: "in_progress", description: "Execution started" },
  { from: "in_progress", to: "syncing", description: "Syncing to ad server" },
  { from: "syncing", to: "booked", description: "Ad server confirmed booking" },
  { from: "booked", to: "completed", description: "Order fulfilled" },
  { from: "booked", to: "unbooked", description: "Booking reversed by ad server" },
  // Failure / cancellation from any active state
  { from: "draft", to: "cancelled", description: "Cancelled before submission" },
  { from: "submitted", to: "cancelled", description: "Cancelled after submission" },
  { from: "submitted", to: "failed", description: "Submission processing failed" },
  { from: "pending_approval", to: "cancelled", description: "Cancelled during approval" },
  { from: "approved", to: "cancelled", description: "Cancelled after approval" },
  { from: "in_progress", to: "failed", description: "Execution failed" },
  { from: "in_progress", to: "cancelled", description: "Cancelled during execution" },
  { from: "syncing", to: "failed", description: "Ad server sync failed" },
  // Re-submission
  { from: "rejected", to: "draft", description: "Returned to draft for revision" },
  { from: "failed", to: "draft", description: "Reset to draft after failure" },
  { from: "unbooked", to: "draft", description: "Reset to draft after unbooking" },
];

/**
 * `forward` moves the order along; `stop` ends or fails it; `reset` sends it
 * back to draft. The screen groups by this so the button a hurried operator
 * reaches first is never the one that cancels.
 */
export type StepKind = "forward" | "stop" | "reset";

export type NextStep = {
  readonly to: OrderStatus;
  readonly label: string;
  readonly description: string;
  readonly kind: StepKind;
};

/** The verb for arriving at a status. One per target, since the table has no target reached two ways that should read differently. */
const VERB: Readonly<Record<OrderStatus, string>> = {
  draft: "Return to draft",
  submitted: "Submit for review",
  pending_approval: "Send for approval",
  approved: "Approve",
  in_progress: "Start execution",
  syncing: "Mark syncing",
  booked: "Mark booked",
  completed: "Mark completed",
  rejected: "Reject",
  failed: "Mark failed",
  cancelled: "Cancel order",
  unbooked: "Mark unbooked",
};

function kindOf(to: OrderStatus): StepKind {
  if (to === "draft") return "reset";
  if (to === "cancelled" || to === "failed" || to === "rejected" || to === "unbooked") return "stop";
  return "forward";
}

const ORDER: Readonly<Record<StepKind, number>> = { forward: 0, reset: 1, stop: 2 };

/** Legal moves from `status`, forward first. An unknown status has none. */
export function nextSteps(status: string): readonly NextStep[] {
  return ORDER_TRANSITIONS.filter((t) => t.from === status)
    .map((t) => ({ to: t.to, label: VERB[t.to], description: t.description, kind: kindOf(t.to) }))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/**
 * What a status means and who is expected to move it — the sentence the
 * screen puts next to the chip, because "pending approval" alone does not
 * say whose approval.
 */
export const STAGE: Readonly<Record<OrderStatus, string>> = {
  draft: "Not yet submitted. Submit it for review, or cancel it.",
  submitted: "Submitted and waiting for review. Route it to human approval, approve it directly, or cancel it.",
  pending_approval: "Held at the approval gate for a human decision: approve or reject it.",
  approved: "Approved and ready to execute. Start execution when the order should go live.",
  in_progress: "Executing. Mark it syncing once it is being pushed to the ad server.",
  syncing: "Being synced to the ad server. Mark it booked when the ad server confirms, or failed.",
  booked: "Booked in the ad server. Mark it completed once fulfilled, or unbooked if the booking was reversed.",
  completed: "Fulfilled. This is terminal; no further transitions.",
  rejected: "Rejected at approval. Return it to draft to revise and resubmit.",
  failed: "Processing failed. Return it to draft to retry.",
  cancelled: "Cancelled. This is terminal; no further transitions.",
  unbooked: "The ad server reversed the booking. Return it to draft to rebook.",
};

/** The happy path, for the lifecycle strip. Off-path statuses are shown beside it, not in it. */
export const HAPPY_PATH: readonly OrderStatus[] = [
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "in_progress",
  "syncing",
  "booked",
  "completed",
];

export function isOrderStatus(status: string): status is OrderStatus {
  return Object.prototype.hasOwnProperty.call(STAGE, status);
}

export type OrderActor = { readonly kind: ActorKind; readonly id: string };

/** The actor string the agent stores, or undefined while a named actor has no name. */
export function actorClaim(actor: OrderActor): string | undefined {
  if (actor.kind === "system") return "system";
  const id = actor.id.trim();
  return id ? `${actor.kind}:${id}` : undefined;
}
