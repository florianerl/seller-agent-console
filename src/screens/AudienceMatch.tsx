import { useState } from "react";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { audienceMatch, type AudienceRef } from "../api/endpoints";
import { describe } from "../api/errors";
import { AUDIENCE_SOURCES } from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { Field, FieldGrid } from "../components/Field";
import { MoreOptionsToggle, OptionGroup } from "../components/MoreOptions";
import { TipField } from "../components/TipField";
import { FormRow, ReadForm } from "../components/WriteForm";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { PackagePicker } from "./pickers";

/** `ComplianceContext.embedding_provenance`, models/audience_ref.py. */
const PROVENANCES = [
  { value: "local_buyer", label: "local buyer" },
  { value: "advertiser_supplied", label: "advertiser supplied" },
  { value: "hosted_external", label: "hosted external" },
  { value: "mock", label: "mock" },
] as const;

type Draft = {
  identifier: string;
  taxonomy: string;
  version: string;
  source: string;
  confidence: string;
  jurisdiction: string;
  consentFramework: string;
  consentStringRef: string;
  attestation: string;
  provenance: string;
  packageId: string;
};

const EMPTY: Draft = {
  identifier: "",
  taxonomy: "",
  version: "",
  source: "",
  confidence: "",
  jurisdiction: "",
  consentFramework: "",
  consentStringRef: "",
  attestation: "",
  provenance: "",
  packageId: "",
};

type Body = { audience_ref: AudienceRef; package_id?: string };

/**
 * The ref's own model rules (`AudienceRef` validators upstream), checked here
 * even though the match route does not run them: a ref this form would build
 * should be one a buyer's agent could send.
 */
function problem(d: Draft): string | undefined {
  if (!d.identifier.trim()) return "An audience identifier is required.";
  const c = d.confidence.trim();
  if (c !== "") {
    const n = Number(c);
    if (!Number.isFinite(n) || n < 0 || n > 1) return "Confidence is a number from 0 to 1.";
    if (d.source === "explicit") return "An explicit ref carries no confidence.";
  }
  if (!!d.jurisdiction.trim() !== !!d.consentFramework.trim()) {
    return "A compliance context needs both a jurisdiction and a consent framework.";
  }
  return undefined;
}

/** Blank fields are left out rather than sent empty. */
function body(d: Draft): Body {
  const t = (v: string) => v.trim() || undefined;
  const ref: Record<string, unknown> = {
    type: "agentic",
    identifier: d.identifier.trim(),
    taxonomy: t(d.taxonomy),
    version: t(d.version),
    source: t(d.source),
    confidence: d.confidence.trim() === "" ? undefined : Number(d.confidence),
  };
  if (d.jurisdiction.trim()) {
    ref.compliance_context = Object.fromEntries(
      Object.entries({
        jurisdiction: d.jurisdiction.trim(),
        consent_framework: d.consentFramework.trim(),
        consent_string_ref: t(d.consentStringRef),
        attestation: t(d.attestation),
        embedding_provenance: t(d.provenance),
      }).filter(([, v]) => v !== undefined),
    );
  }
  const out: Body = {
    audience_ref: Object.fromEntries(
      Object.entries(ref).filter(([, v]) => v !== undefined),
    ) as AudienceRef,
  };
  if (d.packageId.trim()) out.package_id = d.packageId.trim();
  return out;
}

export function AudienceMatchForm() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitted, setSubmitted] = useState<Body | undefined>();
  const set = (key: keyof Draft) => (value: string) => setDraft({ ...draft, [key]: value });
  const [more, setMore] = useState(false);
  const why = problem(draft);
  // Everything under "More options": all of the draft but the identifier.
  const optionsSet = Object.entries(draft).filter(
    ([key, value]) => key !== "identifier" && value.trim(),
  ).length;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }} data-block="audience-match">
      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Audience match
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Stores nothing, so it runs with writes off. Only the identifier is scored today; the other
        options are sent and echoed back unused.
      </Typography>
      <Stack spacing={1.5}>
        <FormRow>
          <TipField
            hint="The agentic audience to score, usually an embedding URI such as emb://buyer.example.com/audiences/x. Required."
            size="small"
            label="Audience identifier"
            value={draft.identifier}
            onChange={(e) => set("identifier")(e.target.value)}
            sx={{ minWidth: 320, flex: 1, maxWidth: 480 }}
          />
          <MoreOptionsToggle open={more} onToggle={() => setMore(!more)} set={optionsSet} />
          <ReadForm
            label="Match"
            action="audience-match"
            disabled={why !== undefined}
            onRun={() => setSubmitted(body(draft))}
          />
        </FormRow>
        {why && draft.identifier.trim() && (
          <Typography variant="body2" sx={{ color: palette.warningText }}>
            {why}
          </Typography>
        )}
        <Collapse in={more}>
          <Stack spacing={1.5}>
            <OptionGroup title="Scope — accepted, but the agent ignores it today">
              <PackagePicker
                label="Package"
                hint="Scope the match to one package. The route accepts it, but the current agent ignores it."
                value={draft.packageId}
                onChange={set("packageId")}
              />
            </OptionGroup>
            <OptionGroup title="Audience reference">
              <TipField
                hint="Which taxonomy the identifier belongs to; for agentic refs, agentic-audiences."
                size="small"
                label="Taxonomy"
                placeholder="agentic-audiences"
                value={draft.taxonomy}
                onChange={(e) => set("taxonomy")(e.target.value)}
              />
              <TipField
                hint="Taxonomy or spec version, for example draft-2026-01."
                size="small"
                label="Version"
                value={draft.version}
                onChange={(e) => set("version")(e.target.value)}
                sx={{ width: 140 }}
              />
              <EnumSelect
                label="Source"
                hint="Where the ref came from: named by the buyer, resolved, or inferred."
                value={draft.source}
                options={AUDIENCE_SOURCES}
                any="Not given"
                onChange={set("source")}
                sx={{ minWidth: 140 }}
              />
              <TipField
                hint="How sure the buyer is, from 0 to 1. Only for resolved or inferred refs."
                size="small"
                label="Confidence"
                value={draft.confidence}
                onChange={(e) => set("confidence")(e.target.value)}
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
                sx={{ width: 120 }}
              />
            </OptionGroup>
            <OptionGroup title="Consent — jurisdiction and framework go together">
              <TipField
                hint="Consent context: the jurisdiction, for example US, EU or GLOBAL. The ref model requires a compliance context for agentic refs."
                size="small"
                label="Jurisdiction"
                value={draft.jurisdiction}
                onChange={(e) => set("jurisdiction")(e.target.value)}
                sx={{ width: 130 }}
              />
              <TipField
                hint="Consent framework, for example IAB-TCFv2, GPP, advertiser-1p or none."
                size="small"
                label="Consent framework"
                value={draft.consentFramework}
                onChange={(e) => set("consentFramework")(e.target.value)}
              />
              <TipField
                hint="An opaque pointer to the consent string — never the raw string."
                size="small"
                label="Consent string ref"
                value={draft.consentStringRef}
                onChange={(e) => set("consentStringRef")(e.target.value)}
              />
              <TipField
                hint="A hash or signature carrying any required attestation."
                size="small"
                label="Attestation"
                value={draft.attestation}
                onChange={(e) => set("attestation")(e.target.value)}
              />
              <EnumSelect
                label="Embedding provenance"
                hint="Where the embedding bytes came from."
                value={draft.provenance}
                options={PROVENANCES}
                any="Not given"
                onChange={set("provenance")}
                sx={{ minWidth: 210 }}
              />
            </OptionGroup>
          </Stack>
        </Collapse>
      </Stack>
      {submitted && <AudienceMatchBody body={submitted} />}
    </Paper>
  );
}

function AudienceMatchBody({ body }: { body: Body }) {
  const match = useResource(`audience:${JSON.stringify(body)}`, (c, signal) =>
    audienceMatch(c, body, signal),
  );
  if (!match.data) {
    return (
      <Typography variant="body2" sx={{ mt: 1 }}>
        {match.result ? describe(match.result) : ""}
      </Typography>
    );
  }
  const m = match.data;
  return (
    <FieldGrid min={140}>
      <Field label="Quality">{m.match_quality}</Field>
      <Field label="Confidence">{m.match_confidence}</Field>
      <Field label="Matched">{m.matched_capabilities.join(", ") || "—"}</Field>
      {/* False is about the seller's configuration, not the audience: the
          score is then POOR whatever was sent. */}
      <Field label="Seller supports agentic">{m.agentic_supported_by_seller ? "yes" : "no"}</Field>
      <Field label="Rationale">{m.rationale ?? "—"}</Field>
    </FieldGrid>
  );
}
