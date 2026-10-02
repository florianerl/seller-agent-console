import { useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { registerCurator, type CuratorRegistration } from "../api/endpoints";
import { describe } from "../api/errors";
import { TipField } from "../components/TipField";
import { ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";

const STEPS = ["Details", "Terms", "Review"] as const;

/**
 * Offered, not enforced: the agent types `curator_type` and the deal types as
 * bare strings, so these are what a live instance holds and what the schema
 * defaults to, not a closed set. The agent's own default for the deal types is
 * the first three.
 */
const CURATOR_TYPES = ["full_service", "optimization", "supply_path_optimizer", "data_provider"];
const DEAL_TYPE_SUGGESTIONS = ["pmp", "preferred", "pg", "auction_package"];
const DEFAULT_DEAL_TYPES = ["pmp", "preferred", "pg"];

/**
 * A free list of short values. Pasted lists arrive as one string and are
 * split on commas; a value typed and left in the box counts (`autoSelect`), so
 * pressing Next never silently drops it.
 */
function ListField({
  label,
  hint,
  value,
  onChange,
  suggestions = [],
}: {
  label: string;
  hint: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  suggestions?: readonly string[];
}) {
  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      autoSelect
      filterSelectedOptions
      size="small"
      options={[...suggestions]}
      value={[...value]}
      onChange={(_, next) => {
        const items = next.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
        onChange([...new Set(items)]);
      }}
      renderValue={(items, getItemProps) =>
        items.map((item, index) => {
          const { key, ...chip } = getItemProps({ index });
          return <Chip key={key} size="small" label={item} {...chip} />;
        })
      }
      renderInput={(params) => <TipField {...params} hint={hint} label={label} />}
    />
  );
}

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
  const [curatorType, setCuratorType] = useState("full_service");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [feeType, setFeeType] = useState("percent");
  const [feeValue, setFeeValue] = useState("0");
  const [dealTypes, setDealTypes] = useState<string[]>(DEFAULT_DEAL_TYPES);
  const [segments, setSegments] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const register = useMutation<CuratorRegistration, unknown>(
    (c, a) => registerCurator(c, a),
    { invalidates: ["curators"] },
  );

  const id = curatorId.trim();
  const displayName = name.trim();
  const host = domain.trim();
  const type = curatorType.trim();
  const email = contactEmail.trim();
  const fee = feeValue.trim() === "" ? NaN : Number(feeValue);
  const detailsReady =
    id !== "" && displayName !== "" && host !== "" && type !== "" && (email === "" || email.includes("@"));
  const termsReady = Number.isFinite(fee) && fee >= 0;
  const ready = detailsReady && termsReady;
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
      setCuratorType("full_service");
      setDescription("");
      setContactEmail("");
      setApiKey("");
      setFeeType("percent");
      setFeeValue("0");
      setDealTypes(DEFAULT_DEAL_TYPES);
      setSegments([]);
      setCategories([]);
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
      canNext={step === 0 ? detailsReady : termsReady}
      finishLabel="Register curator"
      pendingLabel="Registering…"
      onFinish={() =>
        void register.run({
          curator_id: id,
          name: displayName,
          domain: host,
          curator_type: type,
          ...(description.trim() ? { description: description.trim() } : {}),
          fee_type: feeType,
          fee_value: fee,
          ...(email ? { contact_email: email } : {}),
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          audience_segments: segments,
          content_categories: categories,
          supported_deal_types: dealTypes,
        })
      }
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
          <Autocomplete
            freeSolo
            autoSelect
            size="small"
            options={CURATOR_TYPES}
            value={curatorType}
            onInputChange={(_, next) => setCuratorType(next)}
            renderInput={(params) => (
              <TipField
                {...params}
                hint="What kind of curator this is. The agent takes any string and defaults to full_service."
                label="Curator type"
              />
            )}
          />
          <TipField
            hint="Optional. What the curator does, shown on its record."
            size="small"
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TipField
            hint="Optional. Who to reach at the curator. The agent does not show it back."
            size="small"
            type="email"
            label="Contact email (optional)"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            error={email !== "" && !email.includes("@")}
            fullWidth
          />
          <TipField
            hint="Optional. A key the curator itself will use to call this agent. Stored by the agent, never shown again by this console."
            size="small"
            type="password"
            autoComplete="off"
            label="API key (optional)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            fullWidth
          />
        </Box>
      ) : step === 1 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TipField
              hint="percent is a share of media cost; cpm is a surcharge per thousand impressions."
              select
              size="small"
              label="Fee type"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="percent">percent of media cost</MenuItem>
              <MenuItem value="cpm">CPM</MenuItem>
            </TipField>
            <TipField
              hint={feeType === "percent" ? "The percent of media cost, for example 10." : "The CPM surcharge in dollars, for example 0.5."}
              size="small"
              type="number"
              label="Fee value"
              value={feeValue}
              onChange={(e) => setFeeValue(e.target.value)}
              error={!termsReady}
              slotProps={{ htmlInput: { min: 0, step: "any" } }}
              fullWidth
            />
          </Box>
          <ListField
            label="Supported deal types"
            hint="The deal types this curator can run. Starts at the agent's own default."
            value={dealTypes}
            onChange={setDealTypes}
            suggestions={DEAL_TYPE_SUGGESTIONS}
          />
          <ListField
            label="Audience segments"
            hint="Optional. Audience segments the curator offers, for example sports-fans."
            value={segments}
            onChange={setSegments}
          />
          <ListField
            label="Content categories"
            hint="Optional. Content categories the curator covers, for example sports."
            value={categories}
            onChange={setCategories}
          />
        </Box>
      ) : (
        <Box>
          <ReviewList
            rows={[
              ["Curator id", id],
              ["Name", displayName],
              ["Domain", host],
              ["Type", type],
              ["Description", description.trim() || "none"],
              ["Contact email", email || "none"],
              ["API key", apiKey.trim() ? "set (not shown)" : "none"],
              ["Fee", feeType === "percent" ? `${fee}% of media cost` : `${fee} CPM`],
              ["Deal types", dealTypes.join(", ") || "none"],
              ["Audience segments", segments.join(", ") || "none"],
              ["Content categories", categories.join(", ") || "none"],
            ]}
          />
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
