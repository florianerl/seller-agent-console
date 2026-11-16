import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { LEGACY_DEAL_TYPES } from "../api/vocabulary";
import { stamp } from "../lib/time";
import { palette } from "../theme/palette";
import type { NegotiationLog, NegotiationTurn, ProposalContext } from "./approvalContext";

type Terms = {
  price: number | undefined;
  volume: number | undefined;
  dealType: string | undefined;
  flight: string | undefined;
};

type Message = {
  side: "buyer" | "seller";
  turn: NegotiationTurn;
  terms: Terms;
  /** The terms of the message before this one; what differs from it is highlighted. */
  before: Terms | undefined;
};

/**
 * The agent records a price for every round, but volume, deal type and flight
 * only for the opening proposal (and a volume on the counter it raised the
 * approval for). Every bubble therefore carries the last terms known for each
 * field — a field nobody reported changing is shown unchanged — and a field
 * is marked only where the value really differs from the message before.
 */
function messages(log: NegotiationLog, p: ProposalContext | undefined): Message[] {
  let current: Terms = {
    price: p?.requestedPrice,
    volume: p?.requestedImpressions,
    dealType: p?.dealType,
    flight: p?.startDate && p?.endDate ? `${p.startDate} → ${p.endDate}` : undefined,
  };
  const out: Message[] = [];
  let before: Terms | undefined;
  for (const turn of log.turns) {
    const buyer: Terms = { ...current, price: turn.buyerPrice ?? current.price };
    out.push({ side: "buyer", turn, terms: buyer, before });
    before = buyer;
    current = buyer;
    const seller: Terms = {
      ...current,
      price: turn.sellerPrice ?? current.price,
      volume:
        turn.round === p?.counterRound && p.counterImpressions !== undefined
          ? p.counterImpressions
          : current.volume,
    };
    out.push({ side: "seller", turn, terms: seller, before });
    before = seller;
    current = seller;
  }
  return out;
}

/**
 * The negotiation so far, read like a chat: the buyer on the left, the seller
 * agent on the right, oldest first. Every message states the full terms on the
 * table, with what changed from the message before highlighted. The agent's own
 * reasoning is set apart, because it is not part of what it told the buyer.
 */
export function NegotiationChat({
  log,
  proposal,
  awaitingDecision,
}: {
  log: NegotiationLog;
  proposal: ProposalContext | undefined;
  awaitingDecision: boolean;
}) {
  const currency = proposal?.currency;
  const money = (value: number | undefined) =>
    value === undefined ? "—" : `${currency ?? ""} ${value.toLocaleString()} CPM`.trim();
  const dealLabel = (code: string | undefined) =>
    code ? (LEGACY_DEAL_TYPES.find((t) => t.value === code)?.label ?? code) : "—";
  const last = log.turns[log.turns.length - 1];
  const roundsLabel =
    log.maxRounds !== undefined && last ? `round ${last.round} of ${log.maxRounds}` : undefined;
  const all = messages(log, proposal);

  return (
    <Box sx={{ mt: 2 }} data-block="negotiation-chat">
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>
        Negotiation so far{roundsLabel ? ` — ${roundsLabel}` : ""}
      </Typography>
      <Box
        component="ol"
        aria-label="Negotiation messages"
        sx={{
          listStyle: "none",
          m: 0,
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          backgroundColor: palette.paper,
          border: `1px solid ${palette.line}`,
          borderRadius: 1,
        }}
      >
        {all.map((m, index) => {
          const seller = m.side === "seller";
          const { turn } = m;
          const changed = (key: keyof Terms) => m.before !== undefined && m.before[key] !== m.terms[key];
          // A seller bubble with nothing to say yet (a round awaiting its reply) is not drawn.
          if (seller && turn.sellerPrice === undefined && !turn.messageToBuyer) return null;
          return (
            <Box
              key={`${m.side}${turn.round}`}
              component="li"
              sx={{
                alignSelf: seller ? "flex-end" : "flex-start",
                maxWidth: "75%",
                px: 1.5,
                py: 1,
                color: palette.text,
                backgroundColor: seller ? palette.navActiveWash : palette.ground,
                border: `1px solid ${palette.line}`,
                borderRadius: seller ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              }}
              data-side={m.side}
              data-round={turn.round}
            >
              <Box sx={{ fontSize: 11, fontWeight: 700, color: palette.textSecondary, mb: 0.25 }}>
                {seller ? "Seller agent" : "Buyer"} · round {turn.round}
              </Box>
              <Typography variant="body2">
                {seller ? moveLabel(turn.action) : index === 0 ? "Proposes" : "Offers"}{" "}
                <Term changed={changed("price")} was={m.before ? money(m.before.price) : undefined}>
                  <strong>{money(m.terms.price)}</strong>
                </Term>
              </Typography>
              <Box component="dl" sx={{ m: 0, mt: 0.5, fontSize: 13 }}>
                {index === 0 && proposal && (proposal.productName ?? proposal.productId) && (
                  <Row label="Product">{proposal.productName ?? proposal.productId}</Row>
                )}
                <Row label="Volume">
                  <Term
                    changed={changed("volume")}
                    was={m.before?.volume === undefined ? undefined : `${m.before.volume.toLocaleString()}`}
                  >
                    {m.terms.volume === undefined ? "—" : `${m.terms.volume.toLocaleString()} impressions`}
                  </Term>
                </Row>
                <Row label="Deal type">
                  <Term changed={changed("dealType")} was={dealLabel(m.before?.dealType)}>
                    {dealLabel(m.terms.dealType)}
                  </Term>
                </Row>
                <Row label="Flight">
                  <Term changed={changed("flight")} was={m.before?.flight}>
                    {m.terms.flight ?? "—"}
                  </Term>
                </Row>
              </Box>
              {seller && turn.messageToBuyer && (
                <Typography variant="body2" sx={{ mt: 0.75 }}>
                  {turn.messageToBuyer}
                </Typography>
              )}
              {seller && turn.reasoning && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", mt: 0.75, color: palette.textSecondary, fontStyle: "italic" }}
                >
                  Agent's reasoning: {turn.reasoning}
                </Typography>
              )}
              {turn.timestamp && (
                <Box sx={{ fontSize: 11, color: palette.textSecondary, mt: 0.5, textAlign: "right" }}>
                  {stamp(turn.timestamp)}
                </Box>
              )}
            </Box>
          );
        })}
        {awaitingDecision && (
          <Box
            component="li"
            sx={{ alignSelf: "center", fontSize: 12, color: palette.textSecondary, py: 0.5 }}
            data-state="awaiting-decision"
          >
            Waiting for your decision
          </Box>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        Highlighted terms differ from the message before. The agent records a price for every
        round; volume, deal type and flight are carried over from the proposal unless it reported
        a change.
      </Typography>
    </Box>
  );
}

/** A term that changed is marked in words as well as colour, and says what it was. */
function Term({ changed, was, children }: { changed: boolean; was: string | undefined; children: ReactNode }) {
  if (!changed) return <>{children}</>;
  return (
    <>
      <Box
        component="mark"
        sx={{ backgroundColor: palette.attention, color: palette.brandBlack, px: 0.5, borderRadius: 0.5 }}
        data-changed="true"
      >
        {children}
      </Box>
      {was ? (
        <Box component="span" sx={{ ml: 0.5, fontSize: 11, color: palette.textSecondary }}>
          (was {was})
        </Box>
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Box component="dt" sx={{ color: palette.textSecondary, minWidth: 72 }}>
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

function moveLabel(action: string | undefined): string {
  switch (action) {
    case "counter":
      return "Counters at";
    case "accept":
      return "Accepts at";
    case "reject":
      return "Rejects, last price";
    case "final_offer":
      return "Final offer";
    default:
      return "Responds with";
  }
}
