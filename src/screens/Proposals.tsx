import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  openProposalById,
  openProposals,
  type LineItem,
  type Proposal,
} from "../api/endpoints";
import { describe } from "../api/errors";
import {
  DOWNSTREAM,
  FIELD_MARKERS,
  MARKER_MEANING,
  SPEC_REVISION,
} from "../api/openproposal/fields";
import { unresolvedRefs, type Selectable, type Settable } from "../api/openproposal/shape";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ProtocolNotice } from "../components/ProtocolNotice";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { useCredential } from "../credentials/context";
import { dateOrStamp, plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import type { Resource } from "../query/freshness";
import { useOpenProposalSupport } from "../query/useOpenProposalSupport";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { LineItemHoldWrites, ProposalLifecycleWrites } from "./mutations";

const STATUSES = ["", "draft", "published", "under_review", "agreed", "withdrawn", "expired"];
const TYPES = ["", "standard", "custom"];
/** The provisional list is paginated; one page is what an operator scans. */
const PAGE = 50;

const NOT_REPORTED = "not reported";

function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const figure = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${figure}` : figure;
}

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

/** Where the proposal's own window ends and the buyer's flight begins are easy to conflate. */
function span(from: string | null | undefined, to: string | null | undefined): string {
  return from || to ? `${dateOrStamp(from)} – ${dateOrStamp(to)}` : "—";
}

function bounds(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${count(min)} – ${count(max)}`;
  if (min !== null) return `from ${count(min)}`;
  if (max !== null) return `up to ${count(max)}`;
  return "—";
}

function Status({ status }: { status: string | null }) {
  return status ? (
    <StatusChip status={status} />
  ) : (
    <Typography component="span" variant="body2" color="text.secondary">
      {NOT_REPORTED}
    </Typography>
  );
}

/**
 * The marker is quoted from the spec, not received — the wire does not carry
 * it — so the chip says which revision it quotes.
 */
function Marker({ field }: { field: string }) {
  const marker = FIELD_MARKERS[field];
  if (!marker) return null;
  return (
    <Tooltip title={`${MARKER_MEANING[marker]} (OpenProposal ${SPEC_REVISION})`}>
      <Chip
        label={marker}
        size="small"
        variant="outlined"
        data-marker={marker}
        sx={{ ml: 0.75, height: 20, fontSize: 11, color: palette.textSecondary, borderColor: palette.line }}
      />
    </Tooltip>
  );
}

function Labelled({ field, label, children }: { field: string; label: string; children: ReactNode }) {
  return (
    <Box data-field={field}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
        <Typography component="span" sx={{ fontSize: 12, fontWeight: 600 }}>
          {label}
        </Typography>
        <Marker field={field} />
      </Box>
      {children}
    </Box>
  );
}

function RefChip({ reference }: { reference: string }) {
  return (
    <Chip
      label={`unresolved ref · ${reference}`}
      size="small"
      variant="outlined"
      data-state="unresolved-ref"
      sx={{ fontFamily: "monospace", fontSize: 11, color: palette.warningText, borderColor: palette.warningText }}
    />
  );
}

function raw(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function OptionSpace({ field, label, space }: { field: string; label: string; space: Selectable | null }) {
  return (
    <Labelled field={field} label={label}>
      {space === null ? (
        <Typography variant="body2" color="text.secondary">
          {NOT_REPORTED}
        </Typography>
      ) : space.kind === "seller-set" ? (
        <Typography variant="body2" data-state="seller-set-fallback">
          {raw(space.value)}{" "}
          <Box component="span" sx={{ color: palette.textSecondary }}>
            — no option set declared, so seller-set (§3.1)
          </Box>
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {space.available.map((option, index) => {
            const included = option.id !== null && space.included.includes(option.id);
            const delta = option.id !== null ? space.pricing[option.id] : undefined;
            return (
              <Box
                key={option.id ?? option.catalogRef ?? index}
                data-option={option.id ?? "ref"}
                sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, fontSize: 13 }}
              >
                {option.catalogRef ? <RefChip reference={option.catalogRef} /> : <span>{option.label}</span>}
                {included && <Chip label="in base rate" size="small" sx={{ height: 20, fontSize: 11 }} />}
                {delta?.deltaCpm !== null && delta?.deltaCpm !== undefined && (
                  <span>+{delta.deltaCpm.toFixed(2)} CPM</span>
                )}
                {delta?.deltaFlat !== null && delta?.deltaFlat !== undefined && (
                  <span>+{delta.deltaFlat.toLocaleString()} flat</span>
                )}
                {delta?.deltaPct !== null && delta?.deltaPct !== undefined && <span>+{delta.deltaPct}%</span>}
              </Box>
            );
          })}
          {space.included.some((id) => !space.available.some((o) => o.id === id)) && (
            <Typography variant="caption" color="text.secondary">
              Included by id without a matching option:{" "}
              {space.included.filter((id) => !space.available.some((o) => o.id === id)).join(", ")}
              {" "}— most likely an option still behind a catalog reference.
            </Typography>
          )}
          {space.maxSelect !== null && (
            <Typography variant="caption" color="text.secondary">
              buyer may select up to {space.maxSelect}
            </Typography>
          )}
        </Stack>
      )}
    </Labelled>
  );
}

function Envelope({ field, label, bounds }: { field: string; label: string; bounds: Settable | null }) {
  const body =
    bounds === null
      ? NOT_REPORTED
      : bounds.kind === "allowed"
        ? bounds.allowed.join(", ") || "nothing allowed"
        : bounds.kind === "range"
          ? `${bounds.min ?? "…"} to ${bounds.max ?? "…"}`
          : `${raw(bounds.value)} — no bounds declared, so seller-set (§3.2)`;
  return (
    <Labelled field={field} label={label}>
      <Typography variant="body2">{body}</Typography>
    </Labelled>
  );
}

function LineItemCard({ proposal, item }: { proposal: Proposal; item: LineItem }) {
  const mechanisms =
    item.transaction_mechanism?.kind === "selectable"
      ? item.transaction_mechanism.available.map((o) => o.id).filter((id): id is string => id !== null)
      : typeof item.transaction_mechanism?.value === "string"
        ? [item.transaction_mechanism.value]
        : [];
  const cap = item.frequency_cap;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0 }} data-line-item={item.line_item_id}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>
          {item.line_item_id}
        </Typography>
        <Chip label={item.channel} size="small" data-channel={item.channel} />
        <StatusChip status={item.status} />
      </Box>

      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Composition
          </Typography>
          <FieldGrid min={220}>
            <OptionSpace field="properties" label="Properties" space={item.properties} />
            <OptionSpace field="environments" label="Environments" space={item.environments} />
            <OptionSpace field="audiences" label="Audiences" space={item.audiences} />
            <OptionSpace field="formats" label="Formats" space={item.formats} />
          </FieldGrid>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">
            Targeting envelope
          </Typography>
          <FieldGrid min={180}>
            <Envelope field="geo" label="Geo" bounds={item.geo} />
            <Envelope field="device" label="Device" bounds={item.device} />
            <Envelope field="daypart" label="Daypart" bounds={item.daypart} />
            <Labelled field="frequency_cap" label="Frequency cap">
              <Typography variant="body2">
                {cap
                  ? `${cap.max?.min ?? "…"}–${cap.max?.max ?? "…"} per ${cap.period ?? "?"}, per ${cap.basis ?? "?"}`
                  : NOT_REPORTED}
              </Typography>
            </Labelled>
            <Labelled field="addressable_scale" label="Addressable scale">
              <Typography variant="body2">
                {count(item.addressable_scale)}
                {item.addressable_scale !== null && (
                  <Box component="span" sx={{ color: palette.textSecondary }}>
                    {" "}— for the default composition
                  </Box>
                )}
              </Typography>
            </Labelled>
          </FieldGrid>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">
            Commercial terms
            <Marker field="pricing" />
          </Typography>
          {item.pricing.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No pricing reported.
            </Typography>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" data-block="pricing">
                <TableHead>
                  <TableRow>
                    <TableCell>Method</TableCell>
                    <TableCell>Gross (list)</TableCell>
                    <TableCell>Agreed · derived</TableCell>
                    <TableCell>Seller rate</TableCell>
                    <TableCell>Floor</TableCell>
                    <TableCell>Rate holds until</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {item.pricing.map((p, index) => (
                    <TableRow key={index}>
                      <TableCell>{p.cost_method ?? "—"}</TableCell>
                      <TableCell>{money(p.gross_rate, p.currency)}</TableCell>
                      <TableCell>{money(p.agreed_rate, p.currency)}</TableCell>
                      <TableCell>{money(p.seller_rate, p.currency)}</TableCell>
                      <TableCell>{money(p.floor, p.currency)}</TableCell>
                      <TableCell>{stamp(p.price_valid_until)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
          <FieldGrid min={180}>
            <Field label="Min spend">{count(item.min_spend)}</Field>
            <Field label="Budget bounds">
              {item.commitment_bounds
                ? bounds(item.commitment_bounds.min_budget, item.commitment_bounds.max_budget)
                : "—"}
            </Field>
            <Field label="Availability">
              {item.availability ? (
                <span data-block="availability">
                  {count(item.availability.quantity)} {item.availability.unit ?? ""}{" "}
                  {item.availability.type ? `(${item.availability.type})` : ""}
                  <Box component="span" sx={{ display: "block", fontSize: 12, color: palette.textSecondary }}>
                    agent&apos;s own as-of {stamp(item.availability.as_of)}
                  </Box>
                </span>
              ) : (
                "—"
              )}
            </Field>
          </FieldGrid>
        </Box>

        <Box data-block="commitment">
          <Typography variant="overline" color="text.secondary">
            Buyer commitment
            <Marker field="commitment" />
          </Typography>
          {item.commitment ? (
            <FieldGrid min={180}>
              <Field label="Committed">
                {item.commitment.basis === "spend"
                  ? money(item.commitment.amount, item.commitment.currency)
                  : `${count(item.commitment.amount)} ${item.commitment.basis ?? ""}`}
              </Field>
              <Field label="Flight (not the offer window)">
                {span(item.commitment.flight_start, item.commitment.flight_end)}
              </Field>
              <Field label="Derived units · informative, not binding">
                {count(item.commitment.derived_units)}
              </Field>
              <Field label="Idempotency key">
                <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                  {item.commitment.idempotency_key ?? "—"}
                </Box>
              </Field>
            </FieldGrid>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No buyer commitment yet.
            </Typography>
          )}
        </Box>

        <Box data-block="hold">
          <Typography variant="overline" color="text.secondary">
            Hold
            <Marker field="hold_status" />
          </Typography>
          {item.hold_status ? (
            <FieldGrid min={160}>
              <Field label="State">
                <span data-hold-state={item.hold_status.state ?? "unreported"}>
                  {item.hold_status.state ?? NOT_REPORTED}
                </span>
              </Field>
              <Field label="Available">
                {item.hold_status.hold_available === null ? "—" : item.hold_status.hold_available ? "yes" : "no"}
              </Field>
              <Field label="Duration · scope">
                {item.hold_status.hold_duration ?? "—"} · {item.hold_status.hold_scope ?? "—"}
              </Field>
              <Field label="Expires">{stamp(item.hold_status.hold_expires_at)}</Field>
            </FieldGrid>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No hold terms reported.
            </Typography>
          )}
          <LineItemHoldWrites proposal={proposal} item={item} />
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">
            Guarantees and execution
          </Typography>
          <FieldGrid min={200}>
            <Labelled field="committed_metrics" label="Committed metrics">
              <Typography variant="body2">
                {item.committed_metrics.length
                  ? item.committed_metrics
                      .map((m) => `${m.metric} ${m.value ?? "?"}${m.basis ? ` (${m.basis})` : ""}`)
                      .join(", ")
                  : "—"}
              </Typography>
            </Labelled>
            <Labelled field="transaction_mechanism" label="Transaction mechanism">
              <Stack spacing={0.25} data-block="downstream">
                {mechanisms.length === 0 && <Typography variant="body2">—</Typography>}
                {mechanisms.map((m) => (
                  <Typography key={m} variant="body2">
                    {m.replace(/_/g, " ").toLowerCase()}
                    <Box component="span" sx={{ color: palette.textSecondary }}>
                      {" "}→ {DOWNSTREAM[m] ?? "no downstream standard mapped"}
                    </Box>
                  </Typography>
                ))}
              </Stack>
            </Labelled>
            <Field label="Buying route · serving">
              {item.buying_route ?? "—"} · {item.serving_mode ?? "—"}
            </Field>
            <Field label="Materials due">{dateOrStamp(item.materials_due)}</Field>
            <Field label="Correlation id">
              <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                {item.correlation_id ?? "—"}
              </Box>
            </Field>
          </FieldGrid>
          {item.external_references.length > 0 && (
            <Typography variant="body2" sx={{ mt: 1 }} data-block="external-references">
              Executes as{" "}
              {item.external_references
                .map((r) => `${r.system ?? "?"}${r.role ? ` ${r.role}` : ""} ${r.id ?? "?"}`)
                .join(", ")}
              . Execution records live on <Link href="#/deals">Deals</Link> and{" "}
              <Link href="#/orders">Orders</Link>.
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

function freshnessCaption(resource: Resource<unknown>, what: string): ReactNode {
  if (resource.freshness === "live" && resource.asOf !== undefined) {
    return `as of ${stamp(new Date(resource.asOf).toISOString())}`;
  }
  if (resource.freshness === "stale") return `couldn't refresh — showing the last ${what} received`;
  if (resource.freshness === "blocked") return "access denied";
  return resource.loading ? "loading…" : resource.result ? describe(resource.result) : "";
}

function ProposalDetail({ proposalId }: { proposalId: string }) {
  const detail = useResource(
    `open-proposal:${proposalId}`,
    (connection, signal) => openProposalById(connection, proposalId, signal),
    { refreshInterval: CADENCE.proposals },
  );

  if (detail.freshness === "blocked") return <GatedNotice what="This proposal" result={detail.result} />;
  if (!detail.data) {
    return detail.loading ? (
      <Skeleton height={28} />
    ) : (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const p = detail.data;
  const refs = unresolvedRefs(p);

  return (
    <Stack spacing={2.5} sx={{ py: 1 }} data-block="proposal-detail">
      <FreshnessNote freshness={detail.freshness}>{freshnessCaption(detail, "proposal")}</FreshnessNote>

      {p.status === "agreed" && refs.length > 0 && (
        <Alert severity="warning" variant="outlined" data-state="agreed-with-refs">
          This proposal is agreed but still carries catalog references ({refs.join(", ")}). The
          spec requires an agreed record to be self-contained (§2.2); what these resolve to is not
          fixed by this record.
        </Alert>
      )}

      <Box>
        <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{p.description || "No description."}</Typography>
        {typeof p.specifications === "string" && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
            {p.specifications}
          </Typography>
        )}
        {(p.best_for.length > 0 || p.not_suitable_for.length > 0) && (
          <Typography variant="body2" sx={{ mt: 1 }} data-block="advisory">
            {p.best_for.length > 0 && `Best for: ${p.best_for.join(", ")}. `}
            {p.not_suitable_for.length > 0 && `Not suitable for: ${p.not_suitable_for.join(", ")}. `}
            <Box component="span" sx={{ color: palette.textSecondary }}>
              Advisory, non-normative — never the basis for a match.
            </Box>
          </Typography>
        )}
        {p.seasonality_notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {p.seasonality_notes}
          </Typography>
        )}
      </Box>

      <FieldGrid min={170} data-block="lifecycle">
        <Field label="Status">
          <Status status={p.status} />
        </Field>
        <Field label="Type">{p.type ?? NOT_REPORTED}</Field>
        <Field label="Version">{p.version ?? NOT_REPORTED}</Field>
        <Field label="Seller">
          {p.seller_name ?? "—"}
          {p.seller_id && (
            <Box component="span" sx={{ display: "block", fontSize: 12, color: palette.textSecondary }}>
              {p.seller_id}
            </Box>
          )}
        </Field>
        <Field label="Offer window (not the flight)">{span(p.valid_from, p.valid_until)}</Field>
        <Field label="Brief">{p.brief_ref ?? (p.type === "custom" ? "missing — required for custom" : "—")}</Field>
        <Field label="Assent">
          {p.assent && Object.keys(p.assent).length > 0 ? (
            <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: "pre-wrap" }} data-block="assent">
              {JSON.stringify(p.assent, null, 2)}
            </Box>
          ) : (
            "none recorded"
          )}
        </Field>
      </FieldGrid>

      <Box data-block="negotiation-history">
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>
          Negotiation history · append-only
        </Typography>
        {p.negotiation_history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No rounds recorded.
          </Typography>
        ) : (
          <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
            {p.negotiation_history.map((entry, index) => (
              <Box component="li" key={index} sx={{ fontSize: 13, py: 0.25 }} data-history-action={entry.action}>
                v{entry.version ?? "?"} · {entry.actor ?? "?"} {entry.action ?? "?"}
                {entry.fields_changed.length > 0 && ` · ${entry.fields_changed.join(", ")}`}
                <Box component="span" sx={{ color: palette.textSecondary }}>
                  {" "}· {stamp(entry.at)}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>
          {plural(p.line_items.items.length, "line item")} · each self-contained, one channel each
        </Typography>
        {p.line_items.unreadable > 0 && (
          <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }} data-state="unreadable-line-items">
            {plural(p.line_items.unreadable, "line item")} could not be read and{" "}
            {p.line_items.unreadable === 1 ? "is" : "are"} not shown. The proposal is not
            complete as displayed.
          </Alert>
        )}
        <Stack spacing={1.5}>
          {p.line_items.items.map((item) => (
            <LineItemCard key={item.line_item_id} proposal={p} item={item} />
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Lifecycle</Typography>
        <ProposalLifecycleWrites proposal={p} />
      </Box>
    </Stack>
  );
}

function ProposalList() {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<string | undefined>();
  const { writesEnabled } = useCredential();

  const list = useResource(
    `open-proposals:${status}:${type}`,
    (connection, signal) =>
      openProposals(
        connection,
        { ...(status ? { status } : {}), ...(type ? { type } : {}), limit: PAGE, offset: 0 },
        signal,
      ),
    { refreshInterval: CADENCE.proposals },
  );

  if (list.freshness === "blocked") return <GatedNotice what="OpenProposal proposals" result={list.result} />;

  const rows = list.data?.proposals.items ?? [];
  const unreadable = list.data?.proposals.unreadable ?? 0;
  const total = list.data?.total ?? rows.length;

  return (
    <>
      {!writesEnabled && <ReadOnlyNotice what="Publishing, withdrawing, holding or assenting" />}

      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 200 }}>
          {STATUSES.map((s) => (
            <MenuItem key={s || "any"} value={s}>
              {s ? s.replace(/_/g, " ") : "Any status"}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 160 }}>
          {TYPES.map((t) => (
            <MenuItem key={t || "any"} value={t}>
              {t || "Any type"}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      <FreshnessNote freshness={list.freshness}>
        {list.freshness === "live"
          ? `${plural(rows.length, "proposal")}${total > rows.length ? ` of ${total.toLocaleString()} — the first ${PAGE}` : ""}`
          : freshnessCaption(list, "list")}
      </FreshnessNote>

      {unreadable > 0 && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }} data-state="unreadable-proposals">
          {plural(unreadable, "proposal")} in this page could not be read and{" "}
          {unreadable === 1 ? "is" : "are"} not listed.
        </Alert>
      )}

      <DataPanel>
        {list.loading && rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Skeleton height={28} />
            <Skeleton height={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 3 }} data-state="empty">
            <Typography variant="body2" color="text.secondary">
              {list.freshness === "empty" && list.result?.kind === "unavailable"
                ? describe(list.result)
                : "No proposals match."}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" data-state="rows">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Proposal</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Offer window</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Line items</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const channels = [...new Set(row.line_items.items.map((li) => li.channel))];
                  const statuses = [...new Set(row.line_items.items.map((li) => li.status))];
                  return (
                    <TableRow key={row.proposal_id} hover data-row="proposal">
                      <TableCell>
                        <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{row.proposal_id}</Box>
                        <Box sx={{ fontSize: 12, color: palette.textSecondary }}>{row.seller_name ?? ""}</Box>
                      </TableCell>
                      <TableCell>
                        <Status status={row.status} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{row.type ?? NOT_REPORTED}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                        {span(row.valid_from, row.valid_until)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {row.line_items.items.length} · {channels.join(", ") || "—"}
                        <Box sx={{ color: palette.textSecondary }}>{statuses.join(", ")}</Box>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          aria-expanded={open === row.proposal_id}
                          onClick={() => setOpen((current) => (current === row.proposal_id ? undefined : row.proposal_id))}
                        >
                          {open === row.proposal_id ? "Hide" : "Details"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </DataPanel>

      {/*
        Below the table rather than in an expanded row: a detail this wide
        inside a table cell widens the whole table past a phone's viewport,
        and the panel clips it.
      */}
      {open && rows.some((row) => row.proposal_id === open) && (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 }, mt: 2.5, backgroundColor: palette.ground }}>
          <Typography sx={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>
            {open}
          </Typography>
          <ProposalDetail proposalId={open} />
        </Paper>
      )}
    </>
  );
}

export default function ProposalsScreen() {
  const { support, card } = useOpenProposalSupport();

  return (
    <section data-screen="proposals">
      <PageHeader
        title="Proposals"
        subtitle={`OpenProposal (AAMP 3.0) — a draft spec, read against a provisional contract. Field markers quote ${SPEC_REVISION}.`}
      >
        {support === "supported" ? (
          <ProposalList />
        ) : !card.data && !card.result ? (
          // Nothing has arrived yet, which is not the same as "could not tell".
          <Skeleton height={48} />
        ) : (
          <ProtocolNotice
            support={support}
            protocols={card.data?.capabilities?.protocols ?? []}
            cardResult={card.result}
          />
        )}
      </PageHeader>
    </section>
  );
}
