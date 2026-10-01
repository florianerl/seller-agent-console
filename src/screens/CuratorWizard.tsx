import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { registerCurator } from "../api/endpoints";
import { describe } from "../api/errors";
import { TipField } from "../components/TipField";
import { ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";

const STEPS = ["Details", "Review"] as const;

/**
 * Registering a curator is three strings, so this is the smallest wizard: the
 * fields, then a review that names the consequence. The review is the
 * confirmation, as in the deal and order wizards.
 */
export function CuratorWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [curatorId, setCuratorId] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  const register = useMutation<{ curator_id: string; name: string; domain: string }, unknown>(
    (c, a) => registerCurator(c, a),
    { invalidates: ["curators"] },
  );

  const id = curatorId.trim();
  const displayName = name.trim();
  const host = domain.trim();
  const ready = id !== "" && displayName !== "" && host !== "";
  const done = register.last?.kind === "ok";

  function close() {
    if (register.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one.
    setTimeout(() => {
      setStep(0);
      setCuratorId("");
      setName("");
      setDomain("");
      register.reset();
    }, 200);
  }

  return (
    <WizardDialog
      open={open}
      title="Register a curator"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={ready}
      finishLabel="Register curator"
      pendingLabel="Registering…"
      onFinish={() => void register.run({ curator_id: id, name: displayName, domain: host })}
      canFinish={writesEnabled && ready}
      pending={register.pending}
      done={done}
      block="curator-wizard"
    >
      {step === 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TipField
            hint="Your own short identifier for the curator, for example acme-curation. A duplicate id may 409."
            size="small"
            label="Curator id"
            value={curatorId}
            onChange={(e) => setCuratorId(e.target.value)}
            fullWidth
          />
          <TipField
            hint="Display name of the curator. Required."
            size="small"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TipField
            hint="Domain the curator operates from, for example curator.example. Required."
            size="small"
            label="Domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            fullWidth
          />
        </Box>
      ) : (
        <Box>
          <ReviewList rows={[["Curator id", id], ["Name", displayName], ["Domain", host]]} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Registers the curator with the agent. Not idempotent if the id is new; a duplicate id
            may 409.
          </Typography>
          {!writesEnabled && (
            <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
              Writes are switched off for this key. Turn them on from the connection menu to
              register the curator.
            </Alert>
          )}
          {register.last && register.last.kind !== "ok" && (
            <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
              {describe(register.last)}
            </Typography>
          )}
          {done && (
            <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
              Registered {id}.
            </Alert>
          )}
        </Box>
      )}
    </WizardDialog>
  );
}
