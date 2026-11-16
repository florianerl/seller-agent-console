import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { Support } from "../api/capabilities";
import { describe, type Result } from "../api/errors";

/**
 * Shown instead of the OpenProposal screen when the agent does not serve it.
 * It names the route that was asked and what came back, because "not
 * supported" alone leaves an operator unable to tell an agent without the
 * feature from one that is down.
 *
 * `unknown` gets its own wording: a probe that failed is not evidence the
 * routes are missing, and saying so would send someone to upgrade an agent
 * that is merely unreachable.
 */
export function ProtocolNotice({
  support,
  probeResult,
}: {
  support: Exclude<Support, "supported">;
  probeResult: Result<unknown> | undefined;
}) {
  if (support === "unknown") {
    return (
      <Alert severity="warning" variant="outlined" data-state="protocol-unknown">
        <AlertTitle>Could not tell whether this agent serves OpenProposal</AlertTitle>
        <Typography variant="body2">
          Support is read from <code>GET /api/v1/op-gam/line-item/field-map</code>, which{" "}
          {probeResult ? `failed: ${describe(probeResult)}` : "has not answered yet"}. Nothing
          else is sent to the OpenProposal routes until it answers.
        </Typography>
      </Alert>
    );
  }

  return (
    <Alert severity="info" variant="outlined" data-state="protocol-not-served">
      <AlertTitle>This agent does not serve OpenProposal</AlertTitle>
      <Typography variant="body2">
        It answered 404 for <code>GET /api/v1/op-gam/line-item/field-map</code>, so this screen
        sends it nothing else. The routes exist on the seller agent&apos;s{" "}
        <code>feat/openproposal-mapping</code> branch and are not on its main line yet. Proposals
        from the earlier submit-and-counter flow are on the{" "}
        <Link href="#/negotiation">Negotiation</Link> screen, unchanged.
      </Typography>
    </Alert>
  );
}
