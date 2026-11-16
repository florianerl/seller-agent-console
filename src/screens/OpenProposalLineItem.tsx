import { createContext, useContext, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { LineItem } from "../api/endpoints";
import { DOWNSTREAM, FIELD_MARKERS, MARKER_MEANING, SPEC_REVISION } from "../api/openproposal/fields";
import { unresolvedRefs, type Selectable, type Settable } from "../api/openproposal/shape";
import { Field, FieldGrid } from "../components/Field";
import { StatusChip } from "../components/StatusChip";
import { dateOrStamp, stamp } from "../lib/time";
import { palette } from "../theme/palette";
import { money, span } from "./openproposalFormat";

/**
 * One OpenProposal line item, read field by field: what the spec says each
 * party may do with a field (the marker, quoted from the spec) and, when the
 * line item came out of the GAM mapping, where its value came from (the
 * source, reported by the agent). Shared by the mapping results, the
 * many-to-one proposal and the negotiation thread, which all hand back the
 * same object.
 */

/** Upstream's `Source` vocabulary, in words. An unknown word is shown as sent. */
const SOURCE_MEANING: Readonly<Record<string, string>> = {
  ad_server: "Read from the ad-server payload.",
  seller_config: "From the seller's configuration, not the payload.",
  inferred: "Inferred by the mapping, not stated by the ad server. Check it.",
  not_available: "Nothing in the payload could fill this field.",
};

const ProvenanceContext = createContext<Readonly<Record<string, string>> | undefined>(undefined);

const NOT_REPORTED = "not reported";

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

function bounds(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${count(min)} – ${count(max)}`;
  if (min !== null) return `from ${count(min)}`;
  if (max !== null) return `up to ${count(max)}`;
  return "—";
}

/**
 * The marker is quoted from the spec, not received — the wire does not carry
 * it — so the chip says which revision it quotes.
 */
function Marker({ field }: { field: string }) {
  const marker = FIELD_MARKERS[field];
  const source = useContext(ProvenanceContext)?.[field];
  return (
    <>
      {marker && (
        <Tooltip title={`${MARKER_MEANING[marker]} (OpenProposal ${SPEC_REVISION})`}>
          <Chip
            label={marker}
            size="small"
            variant="outlined"
            data-marker={marker}
            sx={{ ml: 0.75, height: 20, fontSize: 11, textTransform: "none", color: palette.textSecondary, borderColor: palette.line }}
          />
        </Tooltip>
      )}
      {source && (
        <Tooltip title={SOURCE_MEANING[source] ?? `Source reported by the agent: ${source}.`}>
          <Chip
            label={source.replace(/_/g, " ")}
            size="small"
            data-source={source}
            sx={{
              ml: 0.75,
              height: 20,
              fontSize: 11,
              // Section headings are overlines; a chip in one keeps its own case.
              textTransform: "none",
              color: source === "not_available" ? palette.warningText : palette.textSecondary,
            }}
          />
        </Tooltip>
      )}
    </>
  );
}

function Labelled({ field, label, children }: { field: string; label: string; children: ReactNode }) {
  return (
    <Box data-field={field}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 0.5, mb: 0.5 }}>
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

export function LineItemCard({
  item,
  provenance,
}: {
  item: LineItem;
  /** From the GAM mapping: where each field's value came from. */
  provenance?: Readonly<Record<string, string>> | undefined;
}) {
  const mechanisms =
    item.transaction_mechanism?.kind === "selectable"
      ? item.transaction_mechanism.available.map((o) => o.id).filter((id): id is string => id !== null)
      : typeof item.transaction_mechanism?.value === "string"
        ? [item.transaction_mechanism.value]
        : [];
  const cap = item.frequency_cap;

  const refs = unresolvedRefs(item);

  return (
    <ProvenanceContext.Provider value={provenance}>
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0 }} data-line-item={item.line_item_id}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>
          {item.line_item_id}
        </Typography>
        <Chip label={item.channel} size="small" data-channel={item.channel} />
        <StatusChip status={item.status} />
      </Box>

      {item.status === "agreed" && refs.length > 0 && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }} data-state="agreed-with-refs">
          Agreed, yet still carrying catalog references ({refs.join(", ")}). The spec requires an agreed
          record to be self-contained (§2.2); what these resolve to is not fixed by this record.
        </Alert>
      )}

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
    </ProvenanceContext.Provider>
  );
}

