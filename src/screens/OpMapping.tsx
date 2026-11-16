import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  buildManyToOneProposal,
  mapGamAdUnit,
  mapGamLineItem,
  mapGamLineItems,
  type FieldMap,
  type FieldRule,
  type MappedBatch,
  type MappedLineItem,
  type ManyToOneResult,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { words, type Option } from "../api/vocabulary";
import { FreshnessNote } from "../components/DataPanel";
import { EnumSelect } from "../components/EnumSelect";
import { Field, FieldGrid } from "../components/Field";
import { TipField } from "../components/TipField";
import { plural, stamp } from "../lib/time";
import type { Resource } from "../query/freshness";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { LineItemCard } from "./OpenProposalLineItem";
import { span } from "./openproposalFormat";
import {
  GAM_AD_UNIT_EXAMPLE,
  GAM_BATCH_EXAMPLE,
  GAM_LINE_ITEM_EXAMPLE,
  MANY_TO_ONE_EXAMPLE,
} from "./opExamples";

/**
 * The OpenProposal mapping routes: payload in, OpenProposal out, with what did
 * not make the trip. They store nothing and need no key upstream, so they are
 * query-shaped and run with writes off (ADR 15). Each run is a read in the
 * console's sense — a resource with its own timestamp — keyed by a run number,
 * so a second run with the same payload is a second answer, not a cache hit.
 */

/**
 * Upstream's `FieldStatus`, in words. Ordered from "made it" to "did not", so
 * the field map reads from what an operator can rely on to what they cannot.
 */
const STATUS_MEANING: ReadonlyArray<readonly [string, string]> = [
  ["mapped", "Copied across unchanged."],
  ["transformed", "Carried across, converted on the way."],
  ["lossy", "Carried across, but something was lost in the conversion."],
  ["no_home", "OpenProposal has no field for it. The value is dropped, or kept only in ext."],
  ["not_applicable", "Ad-server bookkeeping with no commercial meaning."],
  ["unknown", "A field the mapping does not know. Possibly newer than its rules."],
];
const STATUS_TONE: Readonly<Record<string, string>> = {
  mapped: palette.ok,
  transformed: palette.ok,
  lossy: palette.warningText,
  no_home: palette.error,
  unknown: palette.warningText,
};

function StatusTag({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? palette.textSecondary;
  return (
    <Chip
      label={words(status)}
      size="small"
      variant="outlined"
      data-field-status={status}
      sx={{ height: 20, fontSize: 11, color: tone, borderColor: tone }}
    />
  );
}

function short(value: unknown): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function RulesTable({ rules, withValue }: { rules: readonly (FieldRule & { value?: unknown })[]; withValue: boolean }) {
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small" data-block="field-rules">
        <TableHead>
          <TableRow>
            <TableCell>GAM field</TableCell>
            {withValue && <TableCell>Value</TableCell>}
            <TableCell>OpenProposal field</TableCell>
            <TableCell>How</TableCell>
            <TableCell>Problem</TableCell>
            <TableCell>Note</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.gam_field} data-gam-field={rule.gam_field}>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{rule.gam_field}</TableCell>
              {withValue && (
                <TableCell sx={{ fontFamily: "monospace", fontSize: 12, maxWidth: 220, wordBreak: "break-word" }}>
                  {short(rule.value)}
                </TableCell>
              )}
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{rule.op_field ?? "—"}</TableCell>
              <TableCell>
                <StatusTag status={rule.status} />
              </TableCell>
              <TableCell sx={{ fontSize: 12 }}>{rule.problem ? words(rule.problem) : "—"}</TableCell>
              <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>{rule.note || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function asOfCaption(resource: Resource<unknown>): string {
  if (resource.freshness === "stale") return "couldn't refresh — showing the last answer received";
  return resource.asOf !== undefined ? `answered ${stamp(new Date(resource.asOf).toISOString())}` : "";
}

/** A 422 names why; the agent lists the reasons under `errors` for many-to-one. */
function Refusal({ result }: { result: Result<unknown> }) {
  const errors = result.kind === "unavailable" ? result.problem?.["errors"] : undefined;
  return (
    <Alert severity="warning" variant="outlined" data-state="mapping-refused">
      {describe(result)}
      {Array.isArray(errors) && errors.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {errors.map((e, i) => (
            <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>
          ))}
        </Box>
      )}
    </Alert>
  );
}

/** What the mapping said about one line item, then the line item itself. */
function MappedView({ mapped }: { mapped: MappedLineItem }) {
  const notAvailable = Object.entries(mapped.provenance).filter(([, source]) => source === "not_available").length;
  return (
    <Stack spacing={2} data-block="mapped-line-item">
      <FieldGrid min={180}>
        <Field label="Problems">
          {mapped.problems.length ? (
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }} data-block="problems">
              {mapped.problems.map((p) => (
                <Chip key={p} label={words(p)} size="small" variant="outlined" data-problem={p} sx={{ height: 20, fontSize: 11 }} />
              ))}
            </Box>
          ) : (
            "none"
          )}
        </Field>
        <Field label="OpenProposal fields left empty">{notAvailable}</Field>
        <Field label="GAM fields with no home">{mapped.unmapped_source_fields.length}</Field>
      </FieldGrid>
      {mapped.gaps.length > 0 && (
        <Box data-block="gaps">
          <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Gaps the agent reported</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {mapped.gaps.map((g) => (
              <Typography component="li" variant="body2" key={g}>
                {g}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      <LineItemCard item={mapped.line_item} provenance={mapped.provenance} />
      {mapped.field_report.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>
            Every GAM field on the payload, and where it went
          </Typography>
          <RulesTable rules={mapped.field_report} withValue />
        </Box>
      )}
    </Stack>
  );
}

function BatchView({ batch }: { batch: MappedBatch }) {
  const [open, setOpen] = useState<string>();
  const { summary } = batch;
  const counts = (record: Readonly<Record<string, number>>) =>
    Object.entries(record).length
      ? Object.entries(record)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${words(k)} ${n}`)
          .join(" · ")
      : "none";
  const shown = batch.results.find((r) => r.gam_line_item_id === open);

  return (
    <Stack spacing={2} data-block="mapped-batch">
      <FieldGrid min={200}>
        <Field label="Mapped">
          {summary.mapped} of {summary.total}
        </Field>
        <Field label="Rejected as not a sale">{counts(summary.unmappable_by_type)}</Field>
        <Field label="Line items per problem">{counts(summary.problems)}</Field>
        <Field label="GAM fields, by how they landed">{counts(summary.field_status_counts)}</Field>
      </FieldGrid>
      <Stack spacing={0.5}>
        {batch.results.map((r) => (
          <Box key={r.gam_line_item_id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }} data-batch-result={r.gam_line_item_id}>
            <Typography sx={{ fontFamily: "monospace", fontSize: 12 }}>{r.gam_line_item_id}</Typography>
            {r.mapped ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  {r.mapped.line_item.channel} · {plural(r.mapped.problems.length, "problem")}
                </Typography>
                <Button size="small" onClick={() => setOpen((c) => (c === r.gam_line_item_id ? undefined : r.gam_line_item_id))}>
                  {open === r.gam_line_item_id ? "Hide" : "Details"}
                </Button>
              </>
            ) : (
              <Typography variant="body2" sx={{ color: palette.warningText }} data-state="unmappable">
                not mapped: {r.error ?? "no reason given"}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
      {shown?.mapped && <MappedView mapped={shown.mapped} />}
    </Stack>
  );
}

type Mode = "line-item" | "batch" | "ad-unit";
const MODES: readonly Option<Mode>[] = [
  { value: "line-item", label: "One line item (with its order)" },
  { value: "batch", label: "A LineItemService export" },
  { value: "ad-unit", label: "An ad unit" },
];
const EXAMPLES: Readonly<Record<Mode, unknown>> = {
  "line-item": GAM_LINE_ITEM_EXAMPLE,
  batch: GAM_BATCH_EXAMPLE,
  "ad-unit": GAM_AD_UNIT_EXAMPLE,
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parsed and shape-checked here, so a stray comma is a sentence under the box
 * rather than a request the agent answers with a 422.
 */
function parsePayload(text: string, need: (v: Record<string, unknown>) => string | null): { body?: Record<string, unknown>; error?: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { error: `Not JSON: ${(e as Error).message}` };
  }
  if (!isObject(value)) return { error: "Expected a JSON object." };
  const missing = need(value);
  return missing ? { error: missing } : { body: value };
}

const NEEDS: Readonly<Record<Mode, (v: Record<string, unknown>) => string | null>> = {
  "line-item": (v) => (isObject(v["line_item"]) ? null : "Expected a line_item object, optionally with order and network_code."),
  batch: (v) => (Array.isArray(v["line_items"]) ? null : "Expected a line_items array, optionally with orders and network_code."),
  "ad-unit": (v) => (isObject(v["ad_unit"]) ? null : "Expected an ad_unit object, optionally with network_code."),
};

function JsonInput({
  label,
  hint,
  value,
  onChange,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  error: string | undefined;
}) {
  return (
    <TipField
      hint={hint}
      label={label}
      multiline
      minRows={8}
      maxRows={20}
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error}
      slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
    />
  );
}

type GamRun = { n: number; mode: Mode; body: Record<string, unknown> };

function Answer<T>({ resource, render }: { resource: Resource<T>; render: (data: T) => ReactNode }) {
  if (resource.data === undefined) {
    if (resource.loading || !resource.result) return <Skeleton height={48} />;
    return <Refusal result={resource.result} />;
  }
  return (
    <Box>
      <FreshnessNote freshness={resource.freshness}>{asOfCaption(resource)}</FreshnessNote>
      {render(resource.data)}
    </Box>
  );
}

function SingleRun({ run }: { run: GamRun }) {
  const result = useResource(`op-gam:${run.mode}:${run.n}`, (c, signal) =>
    run.mode === "ad-unit"
      ? mapGamAdUnit(c, run.body as Parameters<typeof mapGamAdUnit>[1], signal)
      : mapGamLineItem(c, run.body as Parameters<typeof mapGamLineItem>[1], signal),
  );
  return <Answer resource={result} render={(mapped) => <MappedView mapped={mapped} />} />;
}

function BatchRun({ run }: { run: GamRun }) {
  const result = useResource(`op-gam:${run.mode}:${run.n}`, (c, signal) =>
    mapGamLineItems(c, run.body as Parameters<typeof mapGamLineItems>[1], signal),
  );
  return <Answer resource={result} render={(batch) => <BatchView batch={batch} />} />;
}

export function GamMapping() {
  const [mode, setMode] = useState<Mode>("line-item");
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [run, setRun] = useState<GamRun>();

  function map() {
    const parsed = parsePayload(text, NEEDS[mode]);
    setError(parsed.error);
    if (parsed.body) setRun((prev) => ({ n: (prev?.n ?? 0) + 1, mode, body: parsed.body as Record<string, unknown> }));
  }

  return (
    <Stack spacing={2} data-block="gam-mapping">
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <EnumSelect
          label="Payload"
          hint="What you are pasting. Each goes to its own mapping route."
          value={mode}
          options={MODES}
          onChange={(v) => {
            if (!v) return;
            setMode(v);
            setError(undefined);
          }}
          sx={{ minWidth: 260 }}
        />
        <Button size="small" onClick={() => setText(JSON.stringify(EXAMPLES[mode], null, 2))} data-action="load-example">
          Load the agent&apos;s example
        </Button>
      </Box>
      <JsonInput
        label="GAM payload (JSON)"
        hint="A GAM API v202608 object as LineItemService or InventoryService returns it. Sent to the agent to translate; nothing is stored."
        value={text}
        onChange={setText}
        error={error}
      />
      <Box>
        <Button variant="outlined" size="small" disabled={!text.trim()} onClick={map} data-action="run-gam-mapping">
          Map to OpenProposal
        </Button>
      </Box>
      {run && (run.mode === "batch" ? <BatchRun key={run.n} run={run} /> : <SingleRun key={run.n} run={run} />)}
    </Stack>
  );
}

type BuildRun = { n: number; body: Record<string, unknown> };

function BuildResult({ run }: { run: BuildRun }) {
  const result = useResource<ManyToOneResult>(`op-many-to-one:${run.n}`, (c, signal) =>
    buildManyToOneProposal(c, run.body, signal),
  );
  return <Answer resource={result} render={(built) => <BuiltView built={built} />} />;
}

function BuiltView({ built }: { built: ManyToOneResult }) {
  const { proposal, report } = built;
  const reports = new Map((report ?? []).map((r) => [r.line_item_id, r]));
  return (
    <Stack spacing={2} data-block="built-proposal">
      <FieldGrid min={170}>
        <Field label="Proposal">{proposal.proposal_id}</Field>
        <Field label="Seller">{proposal.seller_name ?? "—"}</Field>
        <Field label="Type · status">
          {proposal.type ?? "—"} · {proposal.status ?? "—"}
        </Field>
        <Field label="Offer window (not the flight)">{span(proposal.valid_from, proposal.valid_until)}</Field>
      </FieldGrid>
      {proposal.description && <Typography variant="body2">{proposal.description}</Typography>}
      {proposal.line_items.unreadable > 0 && (
        <Alert severity="warning" variant="outlined" data-state="unreadable-line-items">
          {plural(proposal.line_items.unreadable, "line item")} could not be read and{" "}
          {proposal.line_items.unreadable === 1 ? "is" : "are"} not shown.
        </Alert>
      )}
      {proposal.line_items.items.map((item) => {
        const r = reports.get(item.line_item_id);
        return (
          <Box key={item.line_item_id}>
            {r && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }} data-report={item.line_item_id}>
                From {r.serving_platform || "an ad server"}, {plural(r.source_objects, "source object")}
                {r.gaps.length > 0 && ` · gaps: ${r.gaps.join("; ")}`}
              </Typography>
            )}
            <LineItemCard item={item} provenance={r?.provenance} />
          </Box>
        );
      })}
    </Stack>
  );
}

export function ManyToOneBuilder() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [run, setRun] = useState<BuildRun>();

  function build() {
    const parsed = parsePayload(text, (v) =>
      Array.isArray(v["line_items"]) ? null : "Expected proposal_id, seller_id, seller_name, description and a line_items array.",
    );
    setError(parsed.error);
    if (parsed.body) setRun((prev) => ({ n: (prev?.n ?? 0) + 1, body: parsed.body as Record<string, unknown> }));
  }

  return (
    <Stack spacing={2} data-block="many-to-one">
      <Typography variant="body2" color="text.secondary">
        One proposal from objects in several ad servers. The agent enforces one ad server and one channel per line
        item, combines objects from the same ad server into one line item as property options, and takes a single
        forecast for the default selection, never a sum. A rule broken comes back as a list.
      </Typography>
      <Box>
        <Button size="small" onClick={() => setText(JSON.stringify(MANY_TO_ONE_EXAMPLE, null, 2))} data-action="load-many-to-one-example">
          Load the agent&apos;s example
        </Button>
      </Box>
      <JsonInput
        label="Many-to-one request (JSON)"
        hint="Upstream's ManyToOneProposalRequest. Sent to the agent to assemble; nothing is stored."
        value={text}
        onChange={setText}
        error={error}
      />
      <Box>
        <Button variant="outlined" size="small" disabled={!text.trim()} onClick={build} data-action="run-many-to-one">
          Build proposal
        </Button>
      </Box>
      {run && <BuildResult key={run.n} run={run} />}
    </Stack>
  );
}

/** The static field map, filtered by how each field lands. Same data as the support probe. */
export function FieldMapTable({ map }: { map: FieldMap }) {
  const [status, setStatus] = useState("");
  const statuses: readonly Option[] = STATUS_MEANING.filter(([s]) => map.some((r) => r.status === s)).map(([value]) => ({
    value,
    label: `${words(value)} (${map.filter((r) => r.status === value).length})`,
  }));
  const rows = status ? map.filter((r) => r.status === status) : map;
  const meaning = STATUS_MEANING.find(([s]) => s === status)?.[1];

  return (
    <Stack spacing={1.5} data-block="field-map">
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <EnumSelect
          label="How the field lands"
          hint="Filter the map by what happens to a GAM field on the way to OpenProposal."
          value={status}
          options={statuses}
          any="Every field"
          onChange={(v) => setStatus(v)}
          sx={{ minWidth: 220 }}
        />
        <Typography variant="body2" color="text.secondary">
          {meaning ?? `${plural(map.length, "GAM field")} on LineItem and Order.`}
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <RulesTable rules={rows} withValue={false} />
      </Paper>
    </Stack>
  );
}
