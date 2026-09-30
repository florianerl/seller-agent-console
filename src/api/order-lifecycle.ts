import { words, type ActorKind, type OrderStatus } from "./vocabulary";

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
  // "Record", not "Mark" or "Start": these five only write the status. The
  // agent pushes nothing to an ad server when an order moves (see
  // RECORD_ONLY), and a verb that sounds like an action implied it did.
  in_progress: "Record execution started",
  syncing: "Record sync started",
  booked: "Record booked",
  completed: "Record completed",
  rejected: "Reject",
  failed: "Mark failed",
  cancelled: "Cancel order",
  unbooked: "Record unbooked",
};

/**
 * Statuses that describe something happening in the ad server. Upstream has
 * no operation that makes it happen: the GAM booking code exists
 * (clients/gam_adapter.py `book_deal`) but no route, flow or MCP tool calls
 * it, and moving an order sends nothing anywhere. Moving into one of these
 * records a claim about the ad server, which the screen says in the
 * confirmation and offers to check against GAM.
 */
export const RECORD_ONLY: ReadonlySet<string> = new Set([
  "in_progress",
  "syncing",
  "booked",
  "unbooked",
  "completed",
]);

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
  submitted: "Submitted and waiting for review. Send it for approval, approve it directly, or cancel it.",
  pending_approval: "Waiting for a human decision: approve or reject it.",
  approved: "Approved and ready to execute. Record execution started when work on it begins.",
  in_progress: "Recorded as executing. Record sync started once someone is setting it up in the ad server.",
  syncing: "Recorded as being set up in the ad server. Record booked once the ad server shows the booking, or failed if it did not take.",
  booked: "Recorded as booked in the ad server. Record completed once fulfilled, or unbooked if the booking was reversed.",
  completed: "Fulfilled. This is terminal; no further transitions.",
  rejected: "Rejected at approval. Return it to draft to revise and resubmit.",
  failed: "Processing failed. Return it to draft to retry.",
  cancelled: "Cancelled. This is terminal; no further transitions.",
  unbooked: "The ad server reversed the booking. Return it to draft to rebook.",
};

/**
 * Who moves an order out of this status — the part the status name does not
 * say, and that an operator would otherwise assume. Upstream moves no order
 * on its own: no flow, ad-server sync, approval or change request calls the
 * state machine (services/order_service.py is the only caller, reached from
 * the REST transition route and the MCP `transition_order` tool). So every
 * waiting order waits on a person, and the ad-server states in particular are
 * a claim someone makes, not a reading of the ad server.
 */
export const MOVED_BY: Readonly<Record<OrderStatus, string>> = {
  draft: "Waits on the seller: nothing submits a draft automatically.",
  submitted: "Waits on the seller. The agent has no approval gate for orders; whoever moves it decides whether it needs approval.",
  pending_approval:
    "Waits on the seller. No approval queue lists orders — the Inbox and the MCP approval tools cover proposals only — so this screen is where it gets decided.",
  approved: "Waits on the seller to start execution.",
  in_progress:
    "Set by hand. The agent neither books into the ad server nor watches it, so each of these steps records what someone did there.",
  syncing:
    "Set by hand. Recording sync started pushed nothing: the agent has no ad-server sync. Check GAM below before recording booked or failed.",
  booked: "Set by hand, from the ad server's side of the booking. Check GAM below to see whether it shows one.",
  completed: "Nothing moves it again.",
  rejected: "Waits on the seller to return it to draft, or leave it.",
  failed: "Waits on the seller to return it to draft, or leave it.",
  cancelled: "Nothing moves it again.",
  unbooked: "Waits on the seller to return it to draft to rebook.",
};

/**
 * Statuses grouped by what they ask of the operator. The list's summary chips
 * and the state map both read this, so "where is everything" and "where is
 * this one" use the same vocabulary.
 */
export const STAGE_GROUPS: readonly {
  readonly id: "intake" | "approval" | "execution" | "rework" | "closed";
  readonly label: string;
  readonly statuses: readonly OrderStatus[];
  /** Whether an order here is waiting on the seller to act. */
  readonly needsAction: boolean;
}[] = [
  { id: "intake", label: "Intake", statuses: ["draft", "submitted"], needsAction: true },
  { id: "approval", label: "Approval", statuses: ["pending_approval"], needsAction: true },
  {
    id: "execution",
    label: "Execution",
    statuses: ["approved", "in_progress", "syncing", "booked"],
    needsAction: false,
  },
  { id: "rework", label: "Rework", statuses: ["rejected", "failed", "unbooked"], needsAction: true },
  { id: "closed", label: "Closed", statuses: ["completed", "cancelled"], needsAction: false },
];

export type StageGroupId = (typeof STAGE_GROUPS)[number]["id"];

export function stageGroupOf(status: string): (typeof STAGE_GROUPS)[number] | undefined {
  return STAGE_GROUPS.find((g) => (g.statuses as readonly string[]).includes(status));
}

/**
 * When the order entered its current status: the last transition, or its
 * creation if it has never moved (creation writes no transition). The agent
 * reports no time-in-state of its own — the report route's docstring promises
 * one it does not compute — so this is derived here from the audit the list
 * already carries.
 */
export function enteredStatusAt(order: {
  readonly created_at: string | null;
  readonly audit_log?: { readonly transitions: readonly { readonly timestamp: string }[] } | null;
}): string | null {
  const transitions = order.audit_log?.transitions ?? [];
  return transitions.length > 0 ? transitions[transitions.length - 1]!.timestamp : order.created_at;
}

/**
 * The actor prefix convention (models/order_state_machine.py). `system` is
 * ambiguous on purpose to say so: it is what the REST route stores when no
 * actor is sent, and what every MCP `transition_order` call stores, because
 * that tool passes none — so a move made from Claude Code reads as system.
 */
export function actorKind(actor: string): "human" | "agent" | "system" | "other" {
  if (actor === "system" || actor.startsWith("system:")) return "system";
  if (actor.startsWith("human:")) return "human";
  if (actor.startsWith("agent:")) return "agent";
  return "other";
}

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

// --- change requests ---------------------------------------------------------

export type Severity = "minor" | "material" | "critical";

/**
 * `classify_severity` in models/change_request.py. Minor requests are
 * auto-approved the moment they are created (`approved_by:
 * "system:auto-approve"`); material and critical ones wait for review, and
 * upstream routes the two identically despite the names.
 */
export function predictSeverity(changeType: string): { severity: Severity; note: string } {
  switch (changeType) {
    case "creative":
      return { severity: "minor", note: "Auto-approved as soon as it is created; it then only needs applying." };
    case "flight_dates":
      return {
        severity: "material",
        note: "Material, so it waits for review — unless the diffs shift the flight by 3 days or less, which makes it minor and auto-approved.",
      };
    case "pricing":
    case "cancellation":
      return { severity: "critical", note: "Critical: it waits for review before it can be applied." };
    default:
      return { severity: "material", note: "Material: it waits for review before it can be applied." };
  }
}

/**
 * Why the agent would refuse a change request against this order, or
 * undefined when it would take it. Mirrors `create_change_request` (services/order_service.py) and
 * `validate_change_request` (models/change_request.py). A refusal at
 * validation is still *saved*, as a failed request, so it is worth catching
 * before the call rather than after.
 */
export function refuseChange(
  order: { readonly status: string; readonly deal_id: string | null },
  changeType?: string,
): string | undefined {
  if (!order.deal_id) {
    return "This order has no deal attached, and the agent only takes change requests for orders with one.";
  }
  if (order.status === "completed" || order.status === "cancelled" || order.status === "failed") {
    return `The agent does not modify an order that is ${words(order.status)}.`;
  }
  if (
    changeType === "cancellation" &&
    !["draft", "submitted", "pending_approval", "approved", "in_progress", "booked"].includes(order.status)
  ) {
    return `The agent refuses a cancellation request while the order is ${words(order.status)}.`;
  }
  return undefined;
}

/** What a change request in each status is waiting for. */
export const CR_STAGE: Readonly<Record<string, string>> = {
  pending: "Created; not yet classified.",
  validating: "Being validated.",
  pending_approval: "Waiting for review. Nothing else lists it — no approval queue and no MCP tool — so review it here.",
  approved: "Approved, not applied yet. Nothing on the order changes until someone applies it.",
  rejected: "Rejected. Nothing on the order changed.",
  applied: "Applied: its values were written into the order's metadata.",
  failed: "Refused at validation when it was created. Nothing on the order changed.",
};
