import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { stamp } from "../lib/time";
import { palette } from "../theme/palette";
import { LEGACY_DEAL_TYPES } from "../api/vocabulary";
import type { NegotiationLog, NegotiationTurn, ProposalContext } from "./approvalContext";

/**
 * The negotiation so far, read like a chat: the buyer on the left, the seller
 * agent on the right, oldest first. The buyer only ever sends a price, so its
 * bubble is that offer; the agent's bubble is its move, the message it gave the
 * buyer, and — set apart — its own reasoning, which is not part of that message.
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
  const last = log.turns[log.turns.length - 1];
  const roundsLabel =
    log.maxRounds !== undefined && last ? `round ${last.round} of ${log.maxRounds}` : undefined;

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
        {log.turns.flatMap((turn) => [
          <Bubble key={`b${turn.round}`} side="buyer" turn={turn} stampValue={turn.timestamp}>
            <Typography variant="body2">
              {turn.round === 1 ? "Proposes" : "Offers"} <strong>{money(turn.buyerPrice)}</strong>
            </Typography>
            {/* The opening message is the whole proposal, not only its price. */}
            {turn.round === 1 && proposal && <OpeningTerms p={proposal} />}
          </Bubble>,
          <Bubble key={`s${turn.round}`} side="seller" turn={turn} stampValue={turn.timestamp}>
            <Typography variant="body2">
              {moveLabel(turn.action)} <strong>{money(turn.sellerPrice)}</strong>
            </Typography>
            {turn === last && proposal?.counterImpressions !== undefined && (
              <Typography variant="body2" sx={{ mt: 0.25 }}>
                for up to {proposal.counterImpressions.toLocaleString()} impressions
              </Typography>
            )}
            {turn.messageToBuyer && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {turn.messageToBuyer}
              </Typography>
            )}
            {turn.reasoning && (
              <Typography
                variant="caption"
                sx={{ display: "block", mt: 0.75, color: palette.textSecondary, fontStyle: "italic" }}
              >
                Agent's reasoning: {turn.reasoning}
              </Typography>
            )}
          </Bubble>,
        ])}
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
    </Box>
  );
}

function OpeningTerms({ p }: { p: ProposalContext }) {
  const dealType = p.dealType
    ? (LEGACY_DEAL_TYPES.find((t) => t.value === p.dealType)?.label ?? p.dealType)
    : undefined;
  const lines: [string, string][] = [
    ["Product", p.productName ?? p.productId ?? ""],
    ["Volume", p.requestedImpressions === undefined ? "" : `${p.requestedImpressions.toLocaleString()} impressions`],
    ["Deal type", dealType ?? ""],
    ["Flight", p.startDate && p.endDate ? `${p.startDate} → ${p.endDate}` : ""],
  ];
  return (
    <Box component="dl" sx={{ m: 0, mt: 0.5, fontSize: 13 }}>
      {lines
        .filter(([, value]) => value !== "")
        .map(([label, value]) => (
          <Box key={label} sx={{ display: "flex", gap: 1 }}>
            <Box component="dt" sx={{ color: palette.textSecondary, minWidth: 72 }}>
              {label}
            </Box>
            <Box component="dd" sx={{ m: 0 }}>
              {value}
            </Box>
          </Box>
        ))}
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

function Bubble({
  side,
  turn,
  stampValue,
  children,
}: {
  side: "buyer" | "seller";
  turn: NegotiationTurn;
  stampValue: string | undefined;
  children: ReactNode;
}) {
  const seller = side === "seller";
  return (
    <Box
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
      data-side={side}
      data-round={turn.round}
    >
      <Box sx={{ fontSize: 11, fontWeight: 700, color: palette.textSecondary, mb: 0.25 }}>
        {seller ? "Seller agent" : "Buyer"} · round {turn.round}
      </Box>
      {children}
      {stampValue && (
        <Box sx={{ fontSize: 11, color: palette.textSecondary, mt: 0.5, textAlign: "right" }}>
          {stamp(stampValue)}
        </Box>
      )}
    </Box>
  );
}
