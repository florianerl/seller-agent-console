import type { Result } from "../api/errors";

/**
 * The two answers to `POST /deals/distribute` that are not plain success or
 * plain failure.
 *
 * Kept out of `DealSend.tsx` so that file only exports components.
 *
 * - 200 `{status: "pending_approval", approval_id, message}`: several DSPs own
 *   the seat ids, so nothing was sent to the SSP. A human picks one on the
 *   Inbox and the deal is created on that decision
 *   (services/deal_service.py:1089-1177, returned at :1267-1270).
 * - 502 `{detail: {error: "outcome_unknown", message}}`: the SSP call failed in
 *   a way that does not say whether it created the deal
 *   (deal_service.py:1276-1277). Resending can create a second copy, so this
 *   never retries and says so.
 */
export function distributeOutcome(
  last: Result<Record<string, unknown>> | undefined,
): { kind: "pending_approval"; approvalId: string | undefined } | { kind: "outcome_unknown" } | undefined {
  if (last?.kind === "ok" && last.data.status === "pending_approval") {
    const id = last.data.approval_id;
    return { kind: "pending_approval", approvalId: typeof id === "string" && id !== "" ? id : undefined };
  }
  if (last?.kind === "unavailable" && last.status === 502 && last.code === "outcome_unknown") {
    return { kind: "outcome_unknown" };
  }
  return undefined;
}
