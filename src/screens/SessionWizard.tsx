import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import { createSession } from "../api/endpoints";
import { describe } from "../api/errors";
import { TipField } from "../components/TipField";
import { ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";

const STEPS = ["Buyer", "Review"] as const;
const EMPTY = { seatId: "", agencyId: "", advertiserId: "", agentUrl: "", authenticated: false };

/**
 * Opening a buyer session, with every field of the agent's
 * `CreateSessionRequest`. All are optional, so the operator can still open a
 * bare session; blank ones are left off the wire.
 */
export function SessionWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(EMPTY);
  const set = (field: keyof typeof EMPTY) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const create = useMutation<Parameters<typeof createSession>[1], unknown>(
    (c, a) => createSession(c, a),
    { invalidates: ["sessions:*"] },
  );
  const done = create.last?.kind === "ok";

  const optional = {
    seat_id: draft.seatId.trim(),
    agency_id: draft.agencyId.trim(),
    advertiser_id: draft.advertiserId.trim(),
    agent_url: draft.agentUrl.trim(),
  };

  function close() {
    if (create.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one.
    setTimeout(() => {
      setStep(0);
      setDraft(EMPTY);
      create.reset();
    }, 200);
  }

  return (
    <WizardDialog
      open={open}
      title="Open a buyer session"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext
      finishLabel="Create session"
      pendingLabel="Creating…"
      onFinish={() =>
        void create.run({
          ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== "")),
          is_authenticated: draft.authenticated,
        })
      }
      canFinish={writesEnabled}
      pending={create.pending}
      done={done}
      block="session-wizard"
    >
      {step === 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            All optional. Leave them blank to open a bare session.
          </Typography>
          <TipField hint="DSP seat id of the buyer." size="small" label="Seat id (optional)" value={draft.seatId} onChange={(e) => set("seatId")(e.target.value)} fullWidth />
          <TipField hint="The agency buying on the advertiser's behalf." size="small" label="Agency id (optional)" value={draft.agencyId} onChange={(e) => set("agencyId")(e.target.value)} fullWidth />
          <TipField hint="The advertiser the session is for." size="small" label="Advertiser id (optional)" value={draft.advertiserId} onChange={(e) => set("advertiserId")(e.target.value)} fullWidth />
          <TipField hint="URL of the buyer agent opening the session." size="small" label="Agent URL (optional)" value={draft.agentUrl} onChange={(e) => set("agentUrl")(e.target.value)} fullWidth />
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.authenticated}
                onChange={(e) => setDraft((d) => ({ ...d, authenticated: e.target.checked }))}
              />
            }
            label="Authenticated session"
          />
        </Box>
      ) : (
        <Box>
          <ReviewList
            rows={[
              ["Seat id", optional.seat_id || "—"],
              ["Agency id", optional.agency_id || "—"],
              ["Advertiser id", optional.advertiser_id || "—"],
              ["Agent URL", optional.agent_url || "—"],
              ["Authenticated", draft.authenticated ? "yes" : "no"],
            ]}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Not idempotent: each call mints a session. These routes declare no authentication
            upstream.
          </Typography>
          {!writesEnabled && (
            <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
              Writes are switched off for this key. Turn them on from the connection menu to create a session.
            </Alert>
          )}
          {create.last && create.last.kind !== "ok" && (
            <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
              {describe(create.last)}
            </Typography>
          )}
          {done && (
            <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
              Session created.
            </Alert>
          )}
        </Box>
      )}
    </WizardDialog>
  );
}
