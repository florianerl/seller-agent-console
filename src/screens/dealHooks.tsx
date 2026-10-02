import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { BuyerIdentityInput, ConsentContextInput, LinearTvInput } from "../api/endpoints";
import { DILIGENCE_STATUSES, type DiligenceStatus } from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { TipField } from "../components/TipField";
import { Optional } from "./dealFields";

/**
 * The optional fields of the deal calls that are not the headline ones: lists,
 * open objects, and the typed blocks (privacy consent, linear TV). The agent
 * takes all of them, and a console that offers only some quietly narrows what
 * an operator can ask for, so each is here, folded away until wanted.
 *
 * Each section is a hook returning the node to render, the value to send (or
 * `undefined` when nothing was filled in, so an untouched section adds
 * nothing to the request) and whether what is typed is valid.
 */

/** A list typed as text: commas, semicolons or line breaks all separate. */
export function splitList(text: string): string[] {
  return [...new Set(text.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean))];
}

export function splitInts(text: string): { values: number[]; ok: boolean } {
  const parts = splitList(text);
  const values = parts.map(Number);
  return { values, ok: values.every((n) => Number.isInteger(n)) };
}

/** Text that must be a JSON object, for the agent's open-object fields. */
export function useJsonObject(label: string, hint: string) {
  const [text, setText] = useState("");
  let value: Record<string, unknown> | undefined;
  let error = false;
  if (text.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        value = parsed as Record<string, unknown>;
      } else {
        error = true;
      }
    } catch {
      error = true;
    }
  }
  const node = (
    <TipField
      hint={hint}
      size="small"
      label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      error={error}
      helperText={error ? "Must be a JSON object, for example {\"key\": \"value\"}." : undefined}
      multiline
      minRows={2}
      fullWidth
      slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }}
    />
  );
  return { node, value, valid: !error, reset: () => setText("") };
}

/** A plain list field: the values to send, or `undefined` when empty. */
export function useListField(label: string, hint: string) {
  const [text, setText] = useState("");
  const values = splitList(text);
  const node = (
    <TipField
      hint={hint}
      size="small"
      label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      fullWidth
    />
  );
  return { node, value: values.length > 0 ? values : undefined, valid: true, reset: () => setText("") };
}

/** ConsentContext: the privacy signals that ride with a request (FD-10). */
export function useConsent() {
  const [regimes, setRegimes] = useState("");
  const [gpp, setGpp] = useState("");
  const [gppSections, setGppSections] = useState("");
  const [tcf, setTcf] = useState("");
  const [gdpr, setGdpr] = useState<"" | "yes" | "no">("");
  const [usPrivacy, setUsPrivacy] = useState("");
  const [diligence, setDiligence] = useState<DiligenceStatus | "">("");
  const [verifiedAt, setVerifiedAt] = useState("");

  const sections = splitInts(gppSections);
  const value: ConsentContextInput | undefined = (() => {
    const out: ConsentContextInput = {};
    const r = splitList(regimes);
    if (r.length) out.applicable_regimes = r;
    if (gpp.trim()) out.gpp_string = gpp.trim();
    if (sections.values.length && sections.ok) out.gpp_section_ids = sections.values;
    if (tcf.trim()) out.tcf_string = tcf.trim();
    if (gdpr) out.gdpr_applies = gdpr === "yes";
    if (usPrivacy.trim()) out.us_privacy = usPrivacy.trim();
    if (diligence) out.diligence_status = diligence;
    if (verifiedAt) out.verified_at = new Date(verifiedAt).toISOString();
    return Object.keys(out).length ? out : undefined;
  })();

  const field = (label: string, hint: string, v: string, set: (s: string) => void, extra?: { error?: boolean }) => (
    <TipField hint={hint} size="small" label={label} value={v} onChange={(e) => set(e.target.value)} fullWidth error={extra?.error ?? false} />
  );
  const node = (
    <Optional summary="Privacy consent (optional)">
      <Typography variant="caption" color="text.secondary">
        Privacy signals that go with the request. Leave all of it empty if none apply.
      </Typography>
      {field("Applicable regimes", "Privacy regimes in scope, for example GDPR or CCPA. Separate several with commas.", regimes, setRegimes)}
      {field("GPP string", "Global Privacy Platform consent string.", gpp, setGpp)}
      {field("GPP section ids", "GPP section ids present in the string, whole numbers separated by commas.", gppSections, setGppSections, { error: !sections.ok })}
      {field("TCF string", "Transparency and Consent Framework string, when GDPR applies.", tcf, setTcf)}
      <EnumSelect
        hint="Whether GDPR applies. Leave undetermined when you do not know; it gates how the TCF string is read."
        label="GDPR applies"
        value={gdpr}
        options={[
          { value: "yes", label: "yes" },
          { value: "no", label: "no" },
        ]}
        onChange={setGdpr}
        any="Undetermined"
        sx={{ width: "100%" }}
      />
      {field("US Privacy string", "US Privacy (CCPA) string, for example 1YNN. Superseded by GPP when that is present.", usPrivacy, setUsPrivacy)}
      <EnumSelect
        hint="Counterparty diligence status from the IAB Diligence Platform."
        label="Diligence status"
        value={diligence}
        options={DILIGENCE_STATUSES}
        onChange={setDiligence}
        any="Not stated"
        sx={{ width: "100%" }}
      />
      <TipField
        hint="When diligence was last verified."
        size="small"
        label="Verified at"
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={verifiedAt}
        onChange={(e) => setVerifiedAt(e.target.value)}
        fullWidth
      />
    </Optional>
  );
  const reset = () => {
    setRegimes("");
    setGpp("");
    setGppSections("");
    setTcf("");
    setGdpr("");
    setUsPrivacy("");
    setDiligence("");
    setVerifiedAt("");
  };
  return { node, value, valid: sections.ok, reset };
}

/** LinearTVParams: required by the agent when the media type is linear TV, and refused otherwise. */
export function useLinearTv() {
  const [demo, setDemo] = useState("");
  const [grps, setGrps] = useState("");
  const [dayparts, setDayparts] = useState("");
  const [networks, setNetworks] = useState("");
  const [dmas, setDmas] = useState("");
  const [spot, setSpot] = useState("30");
  const [cpp, setCpp] = useState("");
  const [measurement, setMeasurement] = useState("nielsen");
  const [rotation, setRotation] = useState("ros");

  const grpsN = Number(grps);
  const grpsOk = grps.trim() === "" || (Number.isInteger(grpsN) && grpsN > 0);
  const cppN = Number(cpp);
  const cppOk = cpp.trim() === "" || (Number.isFinite(cppN) && cppN > 0);
  const valid = demo.trim() !== "" && grpsOk && cppOk;

  const value: LinearTvInput | undefined = demo.trim()
    ? {
        target_demo: demo.trim(),
        ...(grps.trim() && grpsOk ? { grps_requested: grpsN } : {}),
        ...(splitList(dayparts).length ? { dayparts: splitList(dayparts) } : {}),
        ...(splitList(networks).length ? { networks: splitList(networks) } : {}),
        ...(splitList(dmas).length ? { dmas: splitList(dmas) } : {}),
        spot_length: Number(spot),
        ...(cpp.trim() && cppOk ? { target_cpp: { amount_micros: Math.round(cppN * 1_000_000), currency: "USD" } } : {}),
        measurement_currency: measurement.trim() || "nielsen",
        rotation: rotation.trim() || "ros",
      }
    : undefined;

  const node = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-block="linear-tv">
      <Typography variant="caption" color="text.secondary">
        Linear TV is priced on ratings, not impressions, so the agent needs these details.
      </Typography>
      <TipField hint="Target demographic, for example A18-49, A25-54 or HH for households. Required for linear TV." size="small" label="Target demo" value={demo} onChange={(e) => setDemo(e.target.value)} fullWidth />
      <TipField hint="Requested volume in gross rating points, a whole number above zero." size="small" type="number" label="GRPs (optional)" value={grps} onChange={(e) => setGrps(e.target.value)} error={!grpsOk} fullWidth />
      <TipField hint="Target dayparts, for example primetime, daytime or late_night. Separate with commas." size="small" label="Dayparts (optional)" value={dayparts} onChange={(e) => setDayparts(e.target.value)} fullWidth />
      <TipField hint="Target networks, for example NBC, ESPN. Separate with commas." size="small" label="Networks (optional)" value={networks} onChange={(e) => setNetworks(e.target.value)} fullWidth />
      <TipField hint="Nielsen DMA codes, separated by commas. Leave empty for national." size="small" label="DMAs (optional)" value={dmas} onChange={(e) => setDmas(e.target.value)} fullWidth />
      <EnumSelect
        hint="Spot length in seconds."
        label="Spot length"
        value={spot as "15" | "30" | "60"}
        options={[
          { value: "15", label: "15 seconds" },
          { value: "30", label: "30 seconds" },
          { value: "60", label: "60 seconds" },
        ]}
        onChange={(v) => v && setSpot(v)}
        sx={{ width: "100%" }}
      />
      <TipField hint="Your desired cost per rating point, in dollars, a plain number." size="small" type="number" label="Target CPP (optional)" value={cpp} onChange={(e) => setCpp(e.target.value)} error={!cppOk} fullWidth />
      <TipField hint="Audience measurement provider: nielsen, comscore or videoamp." size="small" label="Measurement" value={measurement} onChange={(e) => setMeasurement(e.target.value)} fullWidth />
      <TipField hint="Spot rotation: ros (run of schedule), fixed or program_specific." size="small" label="Rotation" value={rotation} onChange={(e) => setRotation(e.target.value)} fullWidth />
    </Box>
  );
  const reset = () => {
    setDemo("");
    setGrps("");
    setDayparts("");
    setNetworks("");
    setDmas("");
    setSpot("30");
    setCpp("");
    setMeasurement("nielsen");
    setRotation("ros");
  };
  return { node, value, valid, reset };
}

/** The four-field buyer identity the template, migration and bulk routes take. */
export function useBuyerIdentity() {
  const [fields, setFields] = useState({ advertiser_id: "", agency_id: "", seat_id: "", dsp_platform: "" });
  const entries = Object.entries(fields)
    .map(([k, v]) => [k, v.trim()] as const)
    .filter(([, v]) => v !== "");
  const value: BuyerIdentityInput | undefined = entries.length ? Object.fromEntries(entries) : undefined;
  const field = (key: keyof typeof fields, label: string, hint: string) => (
    <TipField hint={hint} size="small" label={label} value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} fullWidth />
  );
  const node = (
    <Optional summary="Buyer details (optional)">
      <Typography variant="caption" color="text.secondary">
        Who this is for. The agent uses it to pick the pricing tier, capped by what its registry can verify.
      </Typography>
      {field("advertiser_id", "Advertiser id", "The advertiser the deal is for.")}
      {field("agency_id", "Agency id", "The agency buying on the advertiser's behalf.")}
      {field("seat_id", "Seat id", "The DSP seat the deal will be activated on.")}
      {field("dsp_platform", "DSP platform", "DSP platform slug, for example ttd or dv360.")}
    </Optional>
  );
  return { node, value, reset: () => setFields({ advertiser_id: "", agency_id: "", seat_id: "", dsp_platform: "" }) };
}
