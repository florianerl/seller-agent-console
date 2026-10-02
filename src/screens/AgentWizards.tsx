import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { discoverAgent, removeRegisteredAgent, updateAgentTrust, type DiscoverAck } from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { StatusChip } from "../components/StatusChip";
import { TipField } from "../components/TipField";
import { ChoiceCards, ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";

const TRUST = ["unknown", "registered", "approved", "preferred", "blocked"] as const;

/** Failure, success and the writes-off notice, shared by both wizards' review step. */
function Outcome({
  last,
  done,
  success,
  action,
}: {
  last: Result<unknown> | undefined;
  done: boolean;
  success: string;
  action: string;
}) {
  const { writesEnabled } = useCredential();
  return (
    <>
      {!writesEnabled && (
        <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
          Writes are switched off for this key. Turn them on from the connection menu to {action}.
        </Alert>
      )}
      {last && last.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
          {describe(last)}
        </Typography>
      )}
      {done && (
        <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
          {success}
        </Alert>
      )}
    </>
  );
}

/**
 * Discovering is one URL, and pressing the button *is* the confirmation, so
 * there is no review step: Discover fetches the card, then the second step
 * shows what came back. A failure stays on that step with Back and a retry.
 */
export function AgentDiscoverWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const discover = useMutation<{ agent_url: string }, DiscoverAck>(
    (c, a) => discoverAgent(c, a),
    { invalidates: ["agents:*"] },
  );

  const target = url.trim();
  const done = discover.last?.kind === "ok";
  const found = discover.last?.kind === "ok" ? discover.last.data.agent : undefined;

  function close() {
    if (discover.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one.
    setTimeout(() => {
      setStep(0);
      setUrl("");
      discover.reset();
    }, 200);
  }

  function run() {
    void discover.run({ agent_url: target });
  }

  return (
    <WizardDialog
      open={open}
      title="Discover an agent"
      steps={["Agent URL", "Result"]}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={writesEnabled && target !== ""}
      nextLabel="Discover agent"
      onNext={() => {
        setStep(1);
        run();
      }}
      finishLabel="Try again"
      pendingLabel="Discovering…"
      onFinish={run}
      canFinish={writesEnabled && target !== ""}
      pending={discover.pending}
      done={done}
      block="agent-discover-wizard"
    >
      {step === 0 ? (
        <Box sx={{ pt: 1 }}>
          <TipField
            hint="Full URL of the remote agent to look up, for example https://agent.example. Its card is fetched and stored as a local registry row."
            size="small"
            label="Agent URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Fetches the remote agent card and writes a local registry row. Re-discovering the same
            URL updates that row.
          </Typography>
          {!writesEnabled && (
            <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
              Writes are switched off for this key. Turn them on from the connection menu to
              discover an agent.
            </Alert>
          )}
        </Box>
      ) : (
        <Box>
          {discover.pending && (
            <Typography variant="body2" color="text.secondary">
              Fetching the card from {target}…
            </Typography>
          )}
          {discover.last && discover.last.kind !== "ok" && (
            <Typography variant="body2" sx={{ color: palette.error }} data-state="write-failed">
              {describe(discover.last)}
            </Typography>
          )}
          {done && (
            <Box data-state="write-ok">
              <Alert severity="success" variant="outlined" sx={{ mb: 2 }}>
                Registered {found?.agent_card?.name || found?.agent_id || target}.
              </Alert>
              {found ? (
                <DiscoveredAgent agent={found} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  The agent accepted the request but did not return the row it stored.
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </WizardDialog>
  );
}

/** What the card claims, laid out to read — not the JSON it arrived as. */
function DiscoveredAgent({ agent }: { agent: NonNullable<DiscoverAck["agent"]> }) {
  const card = agent.agent_card;
  const caps = card?.capabilities;
  const flags = [caps?.streaming && "streaming", caps?.push_notifications && "push notifications"].filter(
    (v): v is string => typeof v === "string",
  );
  const skills = card?.skills ?? [];
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {card?.name || agent.agent_id}
        {card?.version && (
          <Typography component="span" variant="body2" color="text.secondary">
            {" "}
            v{card.version}
          </Typography>
        )}
      </Typography>
      {card?.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {card.description}
        </Typography>
      )}
      <Box sx={{ mt: 2 }}>
        <ReviewList
          rows={[
            ["Agent id", agent.agent_id],
            ["Type", agent.agent_type.replace(/_/g, " ")],
            ["Trust", <StatusChip key="trust" status={agent.trust_status} />],
            ...(card?.url ? [["Card URL", card.url] as const] : []),
            ...(card?.provider?.name ? [["Provider", card.provider.name] as const] : []),
          ]}
        />
      </Box>
      {(caps?.protocols.length || flags.length) ? (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
          {caps?.protocols.map((p) => <Chip key={p} size="small" variant="outlined" label={p} />)}
          {flags.map((f) => <Chip key={f} size="small" label={f} />)}
        </Stack>
      ) : null}
      {skills.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {skills.length} {skills.length === 1 ? "skill" : "skills"}:{" "}
          {skills.map((s) => s.name || s.id).join(", ")}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
        New agents start as unknown. Use Manage on the row to change trust.
      </Typography>
    </Box>
  );
}

type Choice = "trust" | "remove";

/**
 * Raised from an agent's row, so the agent is fixed and only the decision is
 * asked: change its trust, or drop it from the local registry. Removing skips
 * the trust step, so the stepper is shorter for it.
 */
export function AgentManageWizard({
  agent,
  open,
  onClose,
}: {
  agent: { agent_id: string; trust_status: string } | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Choice>("trust");
  const [trust, setTrust] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const id = agent?.agent_id ?? "";
  const newTrust = trust ?? (agent && TRUST.some((t) => t === agent.trust_status) ? agent.trust_status : "approved");

  const update = useMutation<{ id: string; trust_status: string; notes?: string }, unknown>(
    (c, a) =>
      updateAgentTrust(c, a.id, { trust_status: a.trust_status, ...(a.notes ? { notes: a.notes } : {}) }),
    { invalidates: ["agents:*", `agent:${id}`] },
  );
  const remove = useMutation<{ id: string }, unknown>(
    (c, a) => removeRegisteredAgent(c, a.id),
    { invalidates: ["agents:*"] },
  );

  const active = choice === "trust" ? update : remove;
  const done = active.last?.kind === "ok";
  const steps = choice === "trust" ? ["Action", "Trust", "Review"] : ["Action", "Review"];
  const reviewing = step === steps.length - 1;

  function close() {
    if (active.pending) return;
    onClose();
    setTimeout(() => {
      setStep(0);
      setChoice("trust");
      setTrust(undefined);
      setNotes("");
      update.reset();
      remove.reset();
    }, 200);
  }

  return (
    <WizardDialog
      open={open}
      title={`Manage ${id}`}
      steps={steps}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext
      finishLabel={choice === "trust" ? "Update trust" : "Remove agent"}
      pendingLabel={choice === "trust" ? "Updating…" : "Removing…"}
      onFinish={() =>
        void (choice === "trust"
          ? update.run({ id, trust_status: newTrust, ...(notes.trim() ? { notes: notes.trim() } : {}) })
          : remove.run({ id }))
      }
      canFinish={writesEnabled && id !== ""}
      pending={active.pending}
      done={done}
      block="agent-manage-wizard"
    >
      {step === 0 ? (
        <Box sx={{ pt: 1 }}>
          <ChoiceCards<Choice>
            label="What to do with this agent"
            value={choice}
            onChange={(v) => {
              setChoice(v);
              update.reset();
              remove.reset();
            }}
            options={[
              {
                value: "trust",
                title: "Change trust status",
                description: "Your decision about this agent. It caps the buyer's access tier.",
              },
              {
                value: "remove",
                title: "Remove from the registry",
                description: "Deletes the local row. Remote registries are untouched.",
              },
            ]}
          />
        </Box>
      ) : choice === "trust" && !reviewing ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TipField
            hint="Trust decision for the agent: unknown, registered, approved, preferred or blocked. It caps the buyer's access tier, and a blocked agent is refused on later calls."
            select
            size="small"
            label="Trust"
            value={newTrust}
            onChange={(e) => setTrust(e.target.value)}
            fullWidth
          >
            {TRUST.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TipField>
          <TipField
            hint="Optional note on why the trust status changed. Sent only when filled in."
            size="small"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
          />
        </Box>
      ) : (
        <Box>
          {choice === "trust" ? (
            <>
              <ReviewList
                rows={[
                  ["Agent id", id],
                  ["Trust", `${agent?.trust_status ?? "?"} → ${newTrust}`],
                  ...(notes.trim() ? [["Notes", notes.trim()] as const] : []),
                ]}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Trust is this operator's decision and caps the buyer's access tier. A blocked agent
                is refused on later calls.
              </Typography>
            </>
          ) : (
            <>
              <ReviewList rows={[["Agent id", id]]} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Deletes the local registry row. A second remove 404s. Remote registries are
                untouched.
              </Typography>
            </>
          )}
          <Outcome
            last={active.last}
            done={done}
            success={choice === "trust" ? `Updated ${id} to ${newTrust}.` : `Removed ${id}.`}
            action={choice === "trust" ? "change trust" : "remove the agent"}
          />
        </Box>
      )}
    </WizardDialog>
  );
}
