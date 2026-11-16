import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import { SPEC_REVISION } from "../api/openproposal/fields";
import { FreshnessNote } from "../components/DataPanel";
import { PageHeader } from "../components/PageHeader";
import { ProtocolNotice } from "../components/ProtocolNotice";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { ScreenSection } from "../components/ScreenSection";
import { useCredential } from "../credentials/context";
import { stamp } from "../lib/time";
import { useOpenProposalSupport } from "../query/useOpenProposalSupport";
import { FieldMapTable, GamMapping, ManyToOneBuilder } from "./OpMapping";
import { OpenThreadWizard, RecentThreads, ThreadView } from "./OpNegotiation";

/**
 * OpenProposal (AAMP 3.0), as the seller agent serves it on its
 * `feat/openproposal-mapping` branch (ADR 15): negotiation threads this key
 * opens, and the mappings that turn ad-server objects into OpenProposal.
 *
 * Nothing on this screen is called until the field-map probe answers. Against
 * an agent without the branch that is one GET, answered 404, and then nothing.
 */
export default function ProposalsScreen() {
  const { support, probe } = useOpenProposalSupport();
  const { writesEnabled } = useCredential();
  const [thread, setThread] = useState<string>();
  const [wizard, setWizard] = useState(false);
  const [showMap, setShowMap] = useState(false);

  return (
    <section data-screen="proposals">
      <PageHeader
        title="Proposals"
        subtitle={`OpenProposal (AAMP 3.0), served by an unmerged seller-agent branch against spec ${SPEC_REVISION}. Field markers quote the spec; sources come from the agent.`}
      >
        {support !== "supported" ? (
          probe.data === undefined && !probe.result ? (
            // Nothing has answered yet, which is not the same as "could not tell".
            <Skeleton height={48} />
          ) : (
            <ProtocolNotice support={support} probeResult={probe.result} />
          )
        ) : (
          <>
            <ScreenSection
              title="Negotiation threads"
              caption="Ask the seller for a price on one line item, counter, then commit — which books a deal. Each thread belongs to the key that opened it, so these are this key's threads, not the buyers'."
              actions={
                <Button variant="contained" size="small" onClick={() => setWizard(true)} data-action="open-thread-wizard">
                  Ask for a price
                </Button>
              }
            >
              {!writesEnabled && <ReadOnlyNotice what="Opening, moving or committing a thread" />}
              <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", md: "minmax(240px, 320px) 1fr" } }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <RecentThreads selected={thread} onSelect={setThread} />
                </Paper>
                <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 }, minWidth: 0 }}>
                  {thread ? (
                    <ThreadView key={thread} negotiationId={thread} />
                  ) : (
                    <Box sx={{ color: "text.secondary", fontSize: 14 }} data-state="no-thread">
                      Pick a thread, or ask for a price to open one.
                    </Box>
                  )}
                </Paper>
              </Box>
              <OpenThreadWizard open={wizard} onClose={() => setWizard(false)} onOpened={setThread} />
            </ScreenSection>

            <ScreenSection
              title="Map from Google Ad Manager"
              caption="Paste what GAM returns and see the OpenProposal line item it becomes — with every field the trip loses. Runs with writes off: the agent translates and stores nothing."
            >
              <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 } }}>
                <GamMapping />
              </Paper>
            </ScreenSection>

            <ScreenSection title="Build a proposal from several ad servers">
              <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 } }}>
                <ManyToOneBuilder />
              </Paper>
            </ScreenSection>

            <ScreenSection
              title="GAM field map"
              caption="The agent's rule for every GAM LineItem and Order field: where it lands in OpenProposal, and what goes wrong on the way."
            >
              <FreshnessNote freshness={probe.freshness}>
                {probe.freshness === "stale"
                  ? "couldn't refresh — showing the last map received"
                  : probe.asOf !== undefined
                    ? `as of ${stamp(new Date(probe.asOf).toISOString())}`
                    : ""}
              </FreshnessNote>
              {probe.data &&
                (showMap ? (
                  <FieldMapTable map={probe.data} />
                ) : (
                  // Folded by default: at ~100 rows it would otherwise be most of the page.
                  <Button size="small" variant="outlined" onClick={() => setShowMap(true)} data-action="show-field-map">
                    Show all {probe.data.length} rules
                  </Button>
                ))}
            </ScreenSection>
          </>
        )}
      </PageHeader>
    </section>
  );
}
