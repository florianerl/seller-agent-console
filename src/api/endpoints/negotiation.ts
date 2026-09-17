import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";
import { MutationAck } from "./shared";

/**
 * A proposal's negotiation history: what each side offered, round by round,
 * and what the agent did about it.
 *
 * The agent answers 404 with `{"detail": "No negotiation found for this
 * proposal"}` for a proposal nobody ever countered, which is not an error
 * condition — most proposals never enter a negotiation. The seam reports that
 * as `unavailable / "http"` with status 404, and the screen has to read it as
 * "no rounds yet" rather than as a failure.
 */

const PATHS = {
  proposals: "/proposals",
} as const;

export const NegotiationRound = z
  .object({
    round_number: z.number(),
    buyer_price: z.number().nullable().catch(null),
    seller_price: z.number().nullable().catch(null),
    /** accept, counter, reject — the agent's vocabulary, rendered as sent. */
    action: z.string(),
    concession_pct: z.number().nullable().catch(null),
    cumulative_concession_pct: z.number().nullable().catch(null),
    rationale: z.string().nullable().catch(null),
    timestamp: z.string().nullable().catch(null),
  })
  .loose();
export type NegotiationRound = z.infer<typeof NegotiationRound>;

/**
 * The response carries no schema at all in openapi.json, and the deployment
 * this was written against had no negotiation to read. Everything below the
 * proposal id is therefore optional with a default: a missing field must show
 * as "not reported" rather than fail the parse and blank the screen.
 */
export const NegotiationStatus = z
  .object({
    proposal_id: z.string(),
    status: z.string().nullable().catch(null),
    rounds: z.array(NegotiationRound).catch([]),
    current_round: z.number().nullable().catch(null),
    max_rounds: z.number().nullable().catch(null),
    final_price: z.number().nullable().catch(null),
    currency: z.string().nullable().catch(null),
  })
  .loose();
export type NegotiationStatus = z.infer<typeof NegotiationStatus>;

export const negotiationStatus = (
  c: Connection,
  proposalId: string,
  signal?: AbortSignal,
): Promise<Result<NegotiationStatus>> =>
  get(c, `${PATHS.proposals}/${encodeURIComponent(proposalId)}/negotiation`, {
    schema: NegotiationStatus,
    signal,
  });

export const submitProposal = (
  c: Connection,
  body: {
    product_id: string;
    deal_type: string;
    price: number;
    impressions: number;
    start_date: string;
    end_date: string;
  },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, PATHS.proposals, { schema: MutationAck, method: "POST", body, signal });

export const counterProposal = (
  c: Connection,
  proposalId: string,
  body: { buyer_price: number; buyer_tier?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.proposals}/${encodeURIComponent(proposalId)}/counter`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

export const postNegotiationMessage = (
  c: Connection,
  body: {
    idempotency_key: string;
    action: string;
    proposal_id?: string;
    negotiation_id?: string;
    quote_id?: string;
    buyer_price?: { amount_micros: number; currency: string };
  },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, "/api/v1/negotiations/messages", { schema: MutationAck, method: "POST", body, signal });
