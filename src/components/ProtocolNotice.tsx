import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { OPENPROPOSAL_PROTOCOL, type Support } from "../api/capabilities";
import { describe, type Result } from "../api/errors";

/**
 * Shown instead of a screen whose protocol the agent does not claim. It says
 * what the agent did claim, verbatim from its card, because "not supported"
 * alone leaves an operator unable to tell an old agent from a misconfigured
 * one.
 *
 * `unknown` gets its own wording: a card that failed to load is not evidence
 * the protocol is missing, and saying so would send someone to upgrade an
 * agent that is merely unreachable.
 */
export function ProtocolNotice({
  support,
  protocols,
  cardResult,
}: {
  support: Exclude<Support, "supported">;
  protocols: readonly string[];
  cardResult: Result<unknown> | undefined;
}) {
  if (support === "unknown") {
    return (
      <Alert severity="warning" variant="outlined" data-state="protocol-unknown">
        <AlertTitle>Could not tell whether this agent speaks OpenProposal</AlertTitle>
        <Typography variant="body2">
          Support is read from the agent card at /.well-known/agent.json, which{" "}
          {cardResult ? `failed: ${describe(cardResult)}` : "has not loaded"}. Nothing is
          requested from the OpenProposal routes until it does.
        </Typography>
      </Alert>
    );
  }

  return (
    <Alert severity="info" variant="outlined" data-state="protocol-not-advertised">
      <AlertTitle>This agent does not advertise OpenProposal 3.0</AlertTitle>
      <Typography variant="body2">
        Its card lists {protocols.length ? protocols.join(", ") : "no protocols"}, not{" "}
        <code>{OPENPROPOSAL_PROTOCOL}</code>, so this screen sends it nothing. Proposals
        from the earlier submit-and-counter flow are on the{" "}
        <Link href="#/negotiation">Negotiation</Link> screen, unchanged.
      </Typography>
    </Alert>
  );
}
