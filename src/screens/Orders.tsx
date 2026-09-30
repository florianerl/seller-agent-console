import { Fragment, useEffect, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepContent from "@mui/material/StepContent";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  changeRequests,
  gamOrders,
  GamOrderRows,
  orderAudit,
  orders,
  type ChangeRequest,
  type ChangeRequestList,
  type Order,
  type OrderAudit,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import {
  CR_STAGE,
  HAPPY_PATH,
  MOVED_BY,
  STAGE,
  STAGE_GROUPS,
  actorKind,
  enteredStatusAt,
  isOrderStatus,
  nextSteps,
  stageGroupOf,
  type OrderActor,
  type StageGroupId,
} from "../api/order-lifecycle";
import { ORDER_STATUSES, words, type OrderStatus } from "../api/vocabulary";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { EnumSelect } from "../components/EnumSelect";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { useCredential } from "../credentials/context";
import {
  ChangeRequestCreate,
  ChangeRequestReviewWrites,
  OrderCreateWrite,
  OrderTransitionWrites,
} from "./mutations";
import { elapsed, plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import type { ResourceHandle } from "../query/useResource";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const sectionHeading = { fontSize: 12, fontWeight: 600, mb: 0.75 } as const;

function asOf(at: number | undefined): string {
  return at === undefined ? "" : `as of ${stamp(new Date(at).toISOString())}`;
}

/** Hand-drawn for the same reason as MenuIcon: no icon package. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/**
 * The next-step column, so the list itself answers "what does this order
 * need". Forward moves only where there are any: listing "cancel" against
 * every open order would make the column say the same thing on every row.
 */
function nextStepSummary(status: string): string {
  const steps = nextSteps(status);
  const forward = steps.filter((s) => s.kind === "forward");
  const shown = forward.length > 0 ? forward : steps;
  return shown.length > 0 ? shown.map((s) => s.label).join(" or ") : "—";
}

/** Change requests that need a person, per order: pending review, or approved and never applied. */
type Waiting = { review: number; apply: number };

function waitingByOrder(list: readonly ChangeRequest[]): Map<string, Waiting> {
  const tally = new Map<string, Waiting>();
  for (const cr of list) {
    if (cr.status !== "pending_approval" && cr.status !== "approved") continue;
    const entry = tally.get(cr.order_id) ?? { review: 0, apply: 0 };
    if (cr.status === "pending_approval") entry.review += 1;
    else entry.apply += 1;
    tally.set(cr.order_id, entry);
  }
  return tally;
}

function waitingLabel(w: Waiting | undefined): string {
  if (!w) return "";
  return [w.review ? `${w.review} to review` : "", w.apply ? `${w.apply} to apply` : ""]
    .filter(Boolean)
    .join(", ");
}

/**
 * Where the order came from. A buyer agent creating an order over REST tags
 * it (`source`, `persona`); the console tags its own. Anything else — an
 * untagged REST call — says so rather than guessing.
 */
function origin(order: Order): string {
  const source = order.metadata["source"];
  const persona = order.metadata["persona"];
  if (typeof source !== "string" || !source) return "not recorded";
  return typeof persona === "string" && persona ? `${source} (${persona})` : source;
}

type Filter =
  | { kind: "all" }
  | { kind: "status"; status: OrderStatus }
  | { kind: "group"; group: StageGroupId }
  | { kind: "waiting" };

function matches(filter: Filter, order: Order, waiting: Map<string, Waiting>): boolean {
  switch (filter.kind) {
    case "all":
      return true;
    case "status":
      return order.status === filter.status;
    case "group":
      return stageGroupOf(order.status)?.id === filter.group;
    case "waiting":
      return waiting.has(order.order_id);
  }
}

function SummaryChip({
  id,
  active,
  attention,
  onClick,
  hint,
  children,
}: {
  id: string;
  active: boolean;
  attention: boolean;
  onClick: () => void;
  hint: string;
  children: ReactNode;
}) {
  const edge = active ? palette.text : palette.line;
  // Tooltip directly, not Hint: Hint's wrapping span would take the flex slot
  // this button is sized for.
  return (
    <Tooltip title={hint} enterDelay={400} placement="top-start" arrow>
    <Box
      component="button"
      type="button"
      data-chip={id}
      data-attention={attention || undefined}
      aria-pressed={active}
      onClick={onClick}
      sx={{
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        border: `1px solid ${edge}`,
        // A mark, in addition to the words, for groups where an order waits
        // on the seller: nothing else will pick that work up.
        borderLeft: `3px solid ${attention ? palette.warningText : edge}`,
        borderRadius: 1,
        backgroundColor: active ? palette.ground : "transparent",
        color: palette.text,
        px: 1.5,
        py: 1,
        // Share the row: fixed widths left a ragged stack on a phone.
        flex: "1 1 140px",
        maxWidth: { sm: 200 },
      }}
    >
      {children}
    </Box>
    </Tooltip>
  );
}

/**
 * Where everything is, in the same groups the state map uses. Each chip is a
 * filter. The agent never moves an order itself, so a count in a group that
 * waits on the seller is work nobody else will pick up.
 */
function StageSummary({
  rows,
  waiting,
  filter,
  onFilter,
}: {
  rows: readonly Order[];
  waiting: Map<string, Waiting>;
  filter: Filter;
  onFilter: (f: Filter) => void;
}) {
  const totals = [...waiting.values()].reduce(
    (t, w) => ({ review: t.review + w.review, apply: t.apply + w.apply }),
    { review: 0, apply: 0 },
  );
  const waitingActive = filter.kind === "waiting";

  return (
    <Box
      data-block="stage-summary"
      role="group"
      aria-label="Orders by stage"
      sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}
    >
      {STAGE_GROUPS.map((group) => {
        const inGroup = rows.filter((o) => (group.statuses as readonly string[]).includes(o.status));
        const active = filter.kind === "group" && filter.group === group.id;
        const byStatus = group.statuses
          .map((s) => [s, inGroup.filter((o) => o.status === s).length] as const)
          .filter(([, n]) => n > 0);
        return (
          <SummaryChip
            key={group.id}
            id={group.id}
            active={active}
            attention={group.needsAction && inGroup.length > 0}
            onClick={() => onFilter(active ? { kind: "all" } : { kind: "group", group: group.id })}
            hint={`Show only orders in ${group.label.toLowerCase()}. Click again to clear the filter.`}
          >
            <Box sx={{ fontSize: 12, color: palette.textSecondary }}>{group.label}</Box>
            <Box sx={{ fontSize: 18, fontWeight: 700 }} data-count={inGroup.length}>
              {inGroup.length}
            </Box>
            <Box sx={{ fontSize: 11, color: palette.textSecondary, minHeight: 16 }}>
              {byStatus.map(([s, n]) => `${n} ${words(s)}`).join(" · ")}
            </Box>
          </SummaryChip>
        );
      })}
      <SummaryChip
        id="waiting"
        active={waitingActive}
        attention={totals.review + totals.apply > 0}
        onClick={() => onFilter(waitingActive ? { kind: "all" } : { kind: "waiting" })}
        hint="Show only orders with change requests waiting for review or apply. Click again to clear the filter."
      >
        <Box sx={{ fontSize: 12, color: palette.textSecondary }}>Change requests waiting</Box>
        <Box sx={{ fontSize: 18, fontWeight: 700 }} data-count={totals.review + totals.apply}>
          {totals.review + totals.apply}
        </Box>
        <Box sx={{ fontSize: 11, color: palette.textSecondary, minHeight: 16 }}>{waitingLabel(totals)}</Box>
      </SummaryChip>
    </Box>
  );
}

type NodeKind = "current" | "next" | "visited" | "other";

/**
 * The marker for one state. Shape carries the meaning as well as colour, so
 * nothing depends on telling hues apart: filled for where the order is, a
 * tick for where it has been, an arrow for where it can go.
 */
function NodeIcon({ kind }: { kind: NodeKind }) {
  const size = 22;
  const common = {
    width: size,
    height: size,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    boxSizing: "border-box",
  } as const;
  switch (kind) {
    case "current":
      return <Box aria-hidden="true" sx={{ ...common, backgroundColor: palette.brandRedText, color: palette.paper }}>●</Box>;
    case "visited":
      return <Box aria-hidden="true" sx={{ ...common, backgroundColor: palette.text, color: palette.paper }}>✓</Box>;
    case "next":
      return <Box aria-hidden="true" sx={{ ...common, border: `2px solid ${palette.text}`, color: palette.text }}>→</Box>;
    case "other":
      return <Box aria-hidden="true" sx={{ ...common, border: `1px solid ${palette.line}` }} />;
  }
}

const NODE_NOTE: Readonly<Record<NodeKind, string>> = {
  current: "now",
  next: "can go next",
  visited: "done",
  other: "",
};

/**
 * Where the order is, where it has been, and where it can go from here: the
 * main path as a stepper, and the four ways off it as chips beside it. A
 * strip of the main path alone hid the loops back to draft and the exits,
 * which is exactly where an operator gets lost.
 */
function StateMap({ status, visited }: { status: string; visited: ReadonlySet<string> }) {
  const next = new Set<string>(nextSteps(status).map((s) => s.to));
  const kindOf = (s: string): NodeKind =>
    s === status ? "current" : next.has(s) ? "next" : visited.has(s) ? "visited" : "other";
  const offPath = ORDER_STATUSES.map((o) => o.value).filter((s) => !HAPPY_PATH.includes(s));
  const onPath = HAPPY_PATH.includes(status as OrderStatus);

  return (
    <Box data-block="state-map">
      <Box sx={{ overflowX: "auto", pb: 1 }}>
        <Stepper
          alternativeLabel
          nonLinear
          activeStep={onPath ? HAPPY_PATH.indexOf(status as OrderStatus) : -1}
          aria-label="Order lifecycle"
          component="ol"
          sx={{ minWidth: 640, p: 0, m: 0, "& .MuiStepConnector-line": { borderColor: palette.line } }}
        >
          {HAPPY_PATH.map((s) => {
            const kind = kindOf(s);
            return (
              <Step
                key={s}
                component="li"
                completed={kind === "visited"}
                data-state-node={s}
                data-node={kind}
                aria-current={kind === "current" ? "step" : undefined}
                sx={{ listStyle: "none" }}
              >
                <StepLabel
                  icon={<NodeIcon kind={kind} />}
                  optional={
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{ display: "block", textAlign: "center", color: palette.textSecondary, minHeight: 18 }}
                    >
                      {NODE_NOTE[kind] || (s === "pending_approval" ? "optional" : "")}
                    </Typography>
                  }
                  sx={{
                    "& .MuiStepLabel-label": {
                      fontSize: 12,
                      mt: "6px !important",
                      fontWeight: kind === "current" ? 700 : 400,
                      color: kind === "other" ? palette.textSecondary : palette.text,
                    },
                  }}
                >
                  {words(s)}
                </StepLabel>
              </Step>
            );
          })}
        </Stepper>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ mt: 1.5 }}
        component="ul"
        aria-label="Ways off the path"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        <Typography component="li" variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Off the path:
        </Typography>
        {offPath.map((s) => {
          const kind = kindOf(s);
          return (
            <Box
              component="li"
              key={s}
              data-state-node={s}
              data-node={kind}
              aria-current={kind === "current" ? "step" : undefined}
            >
              <Chip
                size="small"
                variant={kind === "current" ? "filled" : "outlined"}
                label={`${kind === "next" ? "→ " : kind === "visited" ? "✓ " : ""}${words(s)}${
                  NODE_NOTE[kind] ? ` · ${NODE_NOTE[kind]}` : ""
                }`}
                sx={{
                  fontWeight: kind === "current" ? 700 : 400,
                  color: kind === "current" ? palette.paper : kind === "other" ? palette.textSecondary : palette.text,
                  backgroundColor: kind === "current" ? palette.brandRedText : "transparent",
                  borderColor: kind === "next" ? palette.text : palette.line,
                  borderWidth: kind === "next" ? 2 : 1,
                }}
              />
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function ActorChip({ actor }: { actor: string }) {
  const kind = actorKind(actor);
  return (
    <Chip
      size="small"
      variant="outlined"
      label={kind}
      data-actor-kind={kind}
      sx={{
        height: 20,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: palette.textSecondary,
        borderColor: palette.line,
        mr: 0.75,
      }}
    />
  );
}

function TimelineDot({ tone }: { tone: "start" | "move" | "latest" }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 12,
        height: 12,
        mx: "6px",
        borderRadius: "50%",
        boxSizing: "border-box",
        backgroundColor: tone === "latest" ? palette.brandRedText : tone === "move" ? palette.text : palette.paper,
        border: tone === "start" ? `2px solid ${palette.text}` : "none",
      }}
    />
  );
}

/**
 * The audit trail as a vertical stepper: creation first — which writes no
 * transition of its own — then every move, newest last and marked. Each
 * entry says who claimed to make it, what kind of actor that is, and why.
 */
function Timeline({ audit }: { audit: ResourceHandle<OrderAudit> }) {
  if (audit.loading && !audit.data) return <Skeleton height={24} />;

  if (!audit.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {audit.result ? describe(audit.result) : "no history"}
      </Typography>
    );
  }

  const { transitions, created_at } = audit.data;
  const anySystem = transitions.some((t) => actorKind(t.actor) === "system");
  const connector = { "& .MuiStepConnector-line": { borderColor: palette.line, minHeight: 12 } } as const;
  const label = (primary: ReactNode, when: string | null) => (
    <Stack direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap" useFlexGap>
      <Box sx={{ fontSize: 13 }}>{primary}</Box>
      <Box sx={{ fontSize: 12, color: palette.textSecondary }}>{stamp(when)}</Box>
    </Stack>
  );

  return (
    <Stack spacing={1}>
      <Stepper orientation="vertical" nonLinear activeStep={-1} sx={connector} data-list="transitions">
        <Step completed expanded>
          <StepLabel icon={<TimelineDot tone="start" />}>
            {label(<>Created, in <strong>draft</strong></>, created_at)}
          </StepLabel>
          <StepContent sx={{ borderColor: palette.line, fontSize: 12, color: palette.textSecondary }}>
            Creating an order writes no transition.
          </StepContent>
        </Step>
        {transitions.map((t, index) => (
          <Step key={t.transition_id ?? `${t.timestamp}-${index}`} completed expanded>
            <StepLabel icon={<TimelineDot tone={index === transitions.length - 1 ? "latest" : "move"} />}>
              {label(
                <>
                  {words(t.from_status)} → <strong>{words(t.to_status)}</strong>
                </>,
                t.timestamp,
              )}
            </StepLabel>
            <StepContent sx={{ borderColor: palette.line }}>
              <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                {/* The actor is whatever the caller claimed; the API does not
                    verify it, so it is shown as a label, not as attribution. */}
                <ActorChip actor={t.actor} />
                {t.actor}
                {t.reason ? ` — ${t.reason}` : ""}
              </Box>
              {Object.keys(t.metadata).length > 0 && (
                <Box component="code" sx={{ display: "block", mt: 0.5, fontSize: 11, color: palette.textSecondary }}>
                  {JSON.stringify(t.metadata)}
                </Box>
              )}
            </StepContent>
          </Step>
        ))}
      </Stepper>
      {transitions.length === 0 && (
        <Typography variant="body2" color="text.secondary" data-state="no-transitions">
          No transitions recorded yet.
        </Typography>
      )}
      {anySystem && (
        <Typography variant="caption" color="text.secondary" data-note="system-actor">
          &ldquo;system&rdquo; is what the agent records when a move names no actor — which includes
          every move made with the MCP <code>transition_order</code> tool, from Claude Code or any
          other client, because that tool sends none.
        </Typography>
      )}
    </Stack>
  );
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The order's metadata, split by who wrote it. Applying a change request
 * merges its proposed values in and records each diff as `_changed_<field>`
 * — and changes nothing else — so this block is the only place the effect of
 * an applied change can be seen.
 */
function RecordedOnOrder({ order, applied }: { order: Order; applied: readonly ChangeRequest[] }) {
  const writtenBy = new Map<string, string>();
  for (const cr of applied) {
    for (const key of Object.keys(cr.proposed_values ?? {})) writtenBy.set(key, cr.id);
    for (const diff of cr.diffs) writtenBy.set(`_changed_${diff.field}`, cr.id);
  }
  const entries = Object.entries(order.metadata);
  const fromChange = (k: string) => writtenBy.has(k) || k.startsWith("_changed_");
  const fromCreator = entries.filter(([k]) => !fromChange(k) && k !== "source" && k !== "persona");
  const fromChanges = entries.filter(([k]) => fromChange(k));

  return (
    <Box data-block="order-metadata">
      <Typography sx={sectionHeading}>Recorded on the order</Typography>
      <FieldGrid min={160}>
        <Field label="Source">{origin(order)}</Field>
        <Field label="Deal">
          <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            {order.deal_id || "none attached"}
          </Box>
        </Field>
        <Field label="Quote">
          {order.quote_id ? (
            <Link
              href={`#/quotes?id=${encodeURIComponent(order.quote_id)}`}
              sx={{ fontFamily: "monospace", fontSize: 12 }}
              data-link="quote"
            >
              {order.quote_id}
            </Link>
          ) : (
            <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
              —
            </Box>
          )}
        </Field>
        {fromCreator.map(([k, v]) => (
          <Field key={k} label={words(k)}>
            {show(v)}
          </Field>
        ))}
      </FieldGrid>
      <Box sx={{ mt: 1.5 }} data-list="applied-values">
        <Typography sx={{ fontSize: 12, color: palette.textSecondary, mb: 0.5 }}>
          Written by applied change requests
        </Typography>
        {fromChanges.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-state="no-applied-values">
            Nothing yet. Applying a change request writes its values here; it never changes the
            order&apos;s status.
          </Typography>
        ) : (
          fromChanges.map(([k, v]) => (
            <Box key={k} sx={{ display: "flex", gap: 1.5, fontSize: 12, py: 0.25, flexWrap: "wrap" }}>
              <Box sx={{ fontWeight: 600, minWidth: 140 }}>{k.replace(/^_changed_/, "changed ")}</Box>
              <Box>{show(v)}</Box>
              {writtenBy.get(k) && (
                <Box sx={{ color: palette.textSecondary }}>from {writtenBy.get(k)}</Box>
              )}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function ChangeRequestEntry({ cr, onChanged }: { cr: ChangeRequest; onChanged: () => void }) {
  const autoApproved = cr.decided_by === "system:auto-approve";
  return (
    <Box data-cr={cr.id} sx={{ py: 1.25 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{cr.id}</Box>
        <Box sx={{ fontSize: 13, fontWeight: 600 }}>{words(cr.change_type) || "unspecified change"}</Box>
        {cr.severity && <StatusChip status={cr.severity} />}
        <StatusChip status={cr.status} />
      </Stack>
      <Typography variant="body2" sx={{ mt: 0.5 }} data-block="cr-stage">
        {CR_STAGE[cr.status] ?? `Status ${words(cr.status)}.`}
        {autoApproved && " It was minor, so the agent approved it itself."}
      </Typography>
      <Box sx={{ fontSize: 12, color: palette.textSecondary, mt: 0.25 }}>
        Requested by {cr.requested_by} · {stamp(cr.requested_at)}
        {cr.reason ? ` — ${cr.reason}` : ""}
        {cr.decided_at && !autoApproved ? ` · decided by ${cr.decided_by ?? "—"}, ${stamp(cr.decided_at)}` : ""}
        {cr.applied_at ? ` · applied ${stamp(cr.applied_at)}` : ""}
      </Box>
      {cr.diffs.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 12 }} data-list="cr-diffs">
          {cr.diffs.map((d, i) => (
            <li key={`${d.field}-${i}`}>
              {d.field}: {show(d.old_value)} → <strong>{show(d.new_value)}</strong>
            </li>
          ))}
        </Box>
      )}
      {cr.validation_errors.length > 0 && (
        <Box
          component="ul"
          sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 12, color: palette.error }}
          data-list="cr-validation"
        >
          {cr.validation_errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </Box>
      )}
      {cr.rejection_reason && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          Rejected because: {cr.rejection_reason}
        </Typography>
      )}
      {(cr.status === "pending_approval" || cr.status === "approved") && (
        <ChangeRequestReviewWrites
          crId={cr.id}
          status={cr.status}
          changeType={cr.change_type}
          onChanged={onChanged}
          compact
        />
      )}
    </Box>
  );
}

/**
 * The order's change requests, read from the screen's one list of them. A
 * pending request reaches no approval queue and has no MCP tool, so this row
 * — and the Change requests screen — are the only places it gets decided.
 */
function OrderChangeRequests({
  order,
  status,
  list,
}: {
  order: Order;
  status: string;
  list: ResourceHandle<ChangeRequestList>;
}) {
  const [raising, setRaising] = useState(false);
  const { writesEnabled } = useCredential();
  const rows = (list.data?.change_requests ?? []).filter((cr) => cr.order_id === order.order_id);
  const canCancel = nextSteps(status).some((s) => s.to === "cancelled");
  // Derived rather than remembered from the click: apply never touches the
  // status, so an applied cancellation on a live order is a standing
  // contradiction worth saying out loud on every visit, not only right after.
  const cancelNote =
    status !== "cancelled" && rows.some((cr) => cr.change_type === "cancellation" && cr.status === "applied");

  return (
    <Box data-block="order-change-requests">
      <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <Typography sx={{ ...sectionHeading, mb: 0 }}>{plural(rows.length, "change request")}</Typography>
        <Link href="#/change-requests" sx={{ fontSize: 12 }}>
          All change requests
        </Link>
        <Button
          size="small"
          onClick={() => setRaising((v) => !v)}
          aria-expanded={raising}
          data-action="raise-change-request"
          disabled={!writesEnabled}
        >
          {raising ? "Close" : "Request a change"}
        </Button>
      </Stack>

      {cancelNote && (
        <Typography variant="body2" sx={{ color: palette.warningText, mb: 1 }} data-state="cancel-prompt">
          A cancellation request is applied, but applying only records it in the order&apos;s
          metadata: the order is still {words(status)}.
          {canCancel
            ? " To stop the order, use Cancel order under Next step."
            : " It cannot be cancelled from this status."}
        </Typography>
      )}

      {list.freshness === "blocked" ? (
        <GatedNotice what="Change requests" result={list.result} />
      ) : list.loading && !list.data ? (
        <Skeleton height={24} />
      ) : !list.data ? (
        <Typography variant="body2" color="text.secondary">
          {list.result ? describe(list.result) : ""}
        </Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-change-requests">
          No change requests recorded yet.
        </Typography>
      ) : (
        <Box data-list="change-requests">
          {rows.map((cr, index) => (
            <Box key={cr.id} sx={{ borderTop: index === 0 ? "none" : `1px solid ${palette.line}` }}>
              <ChangeRequestEntry cr={cr} onChanged={list.refresh} />
            </Box>
          ))}
        </Box>
      )}
      {list.data && (
        <Typography
          variant="caption"
          component="p"
          data-freshness={list.freshness}
          sx={{ mt: 0.5, color: list.freshness === "stale" ? palette.warningText : palette.textSecondary }}
        >
          {list.freshness === "stale" ? "couldn't refresh — showing the last list received" : asOf(list.asOf)}
        </Typography>
      )}

      <Collapse in={raising} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          <ChangeRequestCreate orderId={order.order_id} order={{ status, deal_id: order.deal_id }} />
        </Box>
      </Collapse>
    </Box>
  );
}

/** How many GAM orders one check reads. Each check spends the network's API quota. */
const GAM_SCAN = 500;

function gamFinding(dealId: string, result: Result<unknown> | undefined): string | undefined {
  if (!result) return undefined;
  if (result.kind !== "ok") return `the check failed (${describe(result)}).`;
  const parsed = GamOrderRows.safeParse(result.data);
  const rows = parsed.success ? parsed.data.orders : [];
  const matches = rows.filter((o) => o.external_order_id === dealId);
  if (matches.length === 0) {
    return `no order for deal ${dealId} among the ${rows.length} GAM orders read.`;
  }
  return matches.map((o) => `order ${o.id}${o.name ? ` “${o.name}”` : ""} is ${o.status || "of unreported status"}`).join("; ") + ".";
}

/**
 * The only evidence the console can get for an ad-server status. Mounted on
 * request, never polled: `/gam/orders` calls Google Ad Manager with the
 * agent's credentials and spends its quota, which is why the Reporting
 * screen does not poll it either.
 */
function GamCheck({ dealId, onFinding }: { dealId: string; onFinding: (finding: string | undefined) => void }) {
  const scan = useResource("gam-orders:scan", (c, signal) => gamOrders(c, { limit: GAM_SCAN }, signal));
  const finding = gamFinding(dealId, scan.result);
  // Lifted so the Record … confirmations can quote it.
  useEffect(() => onFinding(finding), [finding, onFinding]);

  return (
    <Box data-block="gam-check" sx={{ fontSize: 13 }}>
      {scan.loading && !scan.result ? (
        <Typography variant="body2" color="text.secondary">
          Asking GAM…
        </Typography>
      ) : (
        <Typography variant="body2" data-state={scan.result?.kind === "ok" ? "gam-checked" : "gam-failed"}>
          GAM: {finding}{" "}
          <Box component="span" sx={{ color: palette.textSecondary, fontSize: 12 }}>
            {scan.asOf !== undefined ? asOf(scan.asOf) : ""}
          </Box>{" "}
          <Button size="small" onClick={scan.refresh} disabled={scan.validating} data-action="gam-recheck">
            Check again
          </Button>
        </Typography>
      )}
    </Box>
  );
}

/** Statuses where it is worth asking the ad server what it actually has. */
const CHECKABLE = new Set(["approved", "in_progress", "syncing", "booked", "unbooked"]);

function OrderDetail({
  order,
  changes,
  actor,
  onActorChange,
  onListStale,
  accepted,
  onAccepted,
}: {
  order: Order;
  changes: ResourceHandle<ChangeRequestList>;
  actor: OrderActor;
  onActorChange: (actor: OrderActor) => void;
  onListStale: () => void;
  accepted: string | undefined;
  onAccepted: (to: string | undefined) => void;
}) {
  const audit = useResource(`order-audit:${order.order_id}`, (connection, signal) =>
    orderAudit(connection, order.order_id, {}, signal),
  );

  // The audit is read when the row opens, so it is fresher than the list,
  // which may be up to a poll interval old. The buttons derive from it.
  const status = audit.data?.current_status ?? order.status;
  const drifted = audit.data?.current_status != null && audit.data.current_status !== order.status;
  const transitions = audit.data?.transitions ?? order.audit_log?.transitions ?? [];
  const visited = new Set<string>(["draft", ...transitions.flatMap((t) => [t.from_status, t.to_status])]);
  const since = enteredStatusAt({ created_at: order.created_at, audit_log: { transitions } });
  const applied = (changes.data?.change_requests ?? []).filter(
    (cr) => cr.order_id === order.order_id && cr.status === "applied",
  );
  const [checkGam, setCheckGam] = useState(false);
  const [gam, setGam] = useState<string | undefined>();

  if (audit.freshness === "blocked") {
    return <GatedNotice what="Order audit trail" result={audit.result} />;
  }

  return (
    <Stack spacing={2.5} data-block="order-detail">
      <Box>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.75 }} flexWrap="wrap" useFlexGap>
          <StatusChip status={status} />
          <Typography variant="body2" data-block="stage">
            {isOrderStatus(status) ? STAGE[status] : "This console does not recognise this status."}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" data-block="moved-by">
          {isOrderStatus(status) ? `${MOVED_BY[status]} ` : ""}In this status for {elapsed(since)},
          since {stamp(since)}.
        </Typography>
        <Typography
          variant="caption"
          component="p"
          data-freshness={audit.freshness}
          sx={{ mt: 0.5, color: audit.freshness === "stale" ? palette.warningText : palette.textSecondary }}
        >
          {audit.freshness === "stale"
            ? "couldn't refresh — showing the last audit received"
            : audit.data
              ? asOf(audit.asOf)
              : audit.loading
                ? "reading the order…"
                : ""}
          {drifted && ` · the list still shows ${words(order.status)}; the agent now reports ${words(status)}`}
        </Typography>
      </Box>

      <StateMap status={status} visited={visited} />

      <Box>
        <Typography sx={sectionHeading}>Next step</Typography>
        {CHECKABLE.has(status) && order.deal_id && (
          <Box sx={{ mb: 1.5 }}>
            {checkGam ? (
              <GamCheck dealId={order.deal_id} onFinding={setGam} />
            ) : (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" onClick={() => setCheckGam(true)} data-action="gam-check">
                  Check the ad server
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Asks GAM whether it has an order for deal {order.deal_id}. The steps below only record a
                  status; this is how to see whether the ad server agrees. Spends GAM API quota.
                </Typography>
              </Stack>
            )}
          </Box>
        )}
        {audit.data || audit.result ? (
          <OrderTransitionWrites
            orderId={order.order_id}
            status={status}
            actor={actor}
            onActorChange={onActorChange}
            onStale={() => {
              audit.refresh();
              onListStale();
            }}
            accepted={accepted}
            onAccepted={onAccepted}
            {...(gam ? { adServer: gam } : {})}
          />
        ) : (
          <Skeleton height={32} />
        )}
      </Box>

      <Box>
        <Typography sx={sectionHeading}>Timeline</Typography>
        <Timeline audit={audit} />
      </Box>

      <RecordedOnOrder order={order} applied={applied} />

      <OrderChangeRequests order={order} status={status} list={changes} />
    </Stack>
  );
}

export default function OrdersScreen() {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [openOrder, setOpenOrder] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const { writesEnabled, actorName } = useCredential();
  // The kind is per visit; the name defaults to the one stored with the
  // credential, so it is typed once rather than per session.
  const [actorKindChoice, setActorKindChoice] = useState<OrderActor["kind"]>("human");
  const [typedActorId, setTypedActorId] = useState<string | undefined>();
  const actor: OrderActor = { kind: actorKindChoice, id: typedActorId ?? actorName };
  const [accepted, setAccepted] = useState<{ orderId: string; to: string } | undefined>();

  // One unfiltered read. Upstream scans every stored order whatever the
  // filter, so a cache entry per filter only multiplied the same scan; and
  // the summary needs every order to count them anyway.
  const list = useResource("orders:", (connection, signal) => orders(connection, {}, signal), {
    refreshInterval: CADENCE.orders,
  });
  const changes = useResource(
    "change-requests:",
    (connection, signal) => changeRequests(connection, {}, signal),
    { refreshInterval: CADENCE.changeRequests },
  );

  const all = list.data?.orders ?? [];
  const waiting = waitingByOrder(changes.data?.change_requests ?? []);
  const rows = all.filter((o) => matches(filter, o, waiting));
  const toggle = (orderId: string) =>
    setOpenOrder((current) => (current === orderId ? undefined : orderId));

  const filterText =
    filter.kind === "status"
      ? `with status "${words(filter.status)}"`
      : filter.kind === "group"
        ? `in ${STAGE_GROUPS.find((g) => g.id === filter.group)?.label.toLowerCase() ?? filter.group}`
        : filter.kind === "waiting"
          ? "with change requests waiting"
          : "";

  return (
    <section data-screen="orders">
      <PageHeader
        title="Orders"
        subtitle="Every order the agent has stored. Buyer agents create them; nothing in the agent moves one on its own, so each step below waits on someone here or in Claude Code."
        actions={
          <Button
            variant={creating ? "outlined" : "contained"}
            size="small"
            onClick={() => setCreating((v) => !v)}
            aria-expanded={creating}
            data-action="new-order"
          >
            {creating ? "Close" : "New order"}
          </Button>
        }
      >

      {!writesEnabled && <ReadOnlyNotice what="Creating or moving an order" />}

      {/* Inline rather than a dialog: the create button opens its own
          confirmation, and a dialog over a dialog loses the operator. */}
      <Collapse in={creating} unmountOnExit>
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }} data-block="new-order">
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            New order
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Orders start in draft. Usually a buyer agent creates them; create one here when the
            order came in some other way. Attach the deal it executes: without one, the agent
            refuses change requests against it.
          </Typography>
          <OrderCreateWrite
            onCreated={(orderId) => {
              // Land the operator on the new order's next step, whatever the
              // filter was hiding.
              setFilter({ kind: "all" });
              setOpenOrder(orderId);
              setCreating(false);
            }}
          />
        </Paper>
      </Collapse>

      {list.data && <StageSummary rows={all} waiting={waiting} filter={filter} onFilter={setFilter} />}

      <Box sx={{ mb: 2, display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <EnumSelect
          label="Status"
          value={filter.kind === "status" ? filter.status : ""}
          options={ORDER_STATUSES}
          onChange={(v) => setFilter(v ? { kind: "status", status: v } : { kind: "all" })}
          any="Any status"
          hint="Filter the orders by lifecycle status."
        />
        {filter.kind !== "all" && (
          <Button size="small" onClick={() => setFilter({ kind: "all" })} data-action="clear-filter">
            Show all
          </Button>
        )}
      </Box>

      <FreshnessNote freshness={list.freshness}>
        {list.freshness === "live" &&
          `${plural(rows.length, "order")}${filterText ? ` ${filterText}` : ""}${
            filter.kind !== "all" ? ` of ${all.length}` : ""
          } · ${asOf(list.asOf)}`}
        {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
        {list.freshness === "blocked" && "access denied"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
      </FreshnessNote>

      <DataPanel>
        {list.loading && all.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Skeleton height={28} />
            <Skeleton height={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 3 }} data-state="empty">
            <Typography variant="body2" color="text.secondary">
              {list.freshness === "empty" && list.result?.kind === "unavailable"
                ? describe(list.result)
                : filter.kind !== "all"
                  ? `No orders ${filterText}.`
                  : "No orders yet. Buyer agents create them over the API; use New order to create one here."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Next step</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Deal</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Changes</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((order) => {
                const open = openOrder === order.order_id;
                const w = waiting.get(order.order_id);
                return (
                  <Fragment key={order.order_id}>
                    <TableRow
                      hover
                      data-row="order"
                      onClick={() => toggle(order.order_id)}
                      sx={{ cursor: "pointer", "& > td": open ? { borderBottom: "none" } : {} }}
                    >
                      <TableCell padding="checkbox">
                        <IconButton
                          size="small"
                          aria-label={`${open ? "Hide" : "Show"} ${order.order_id}`}
                          aria-expanded={open}
                          onClick={(e) => {
                            // The row handles the click; without this it would toggle twice.
                            e.stopPropagation();
                            toggle(order.order_id);
                          }}
                        >
                          <Chevron open={open} />
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>
                        {order.order_id}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={order.status} />
                        <Box sx={{ fontSize: 11, color: palette.textSecondary, mt: 0.25 }} data-cell="in-status">
                          for {elapsed(enteredStatusAt(order))}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }} data-cell="next-step">
                        {nextStepSummary(order.status)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: palette.textSecondary }} data-cell="source">
                        {origin(order)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                        {order.deal_id || "—"}
                      </TableCell>
                      <TableCell
                        sx={{ fontSize: 12, color: w ? palette.warningText : palette.textSecondary }}
                        data-cell="changes"
                      >
                        {waitingLabel(w) || "—"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: palette.textSecondary, whiteSpace: "nowrap" }}>
                        {stamp(order.created_at)}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ backgroundColor: palette.ground, py: 2.5, px: 3 }}>
                          <OrderDetail
                            order={order}
                            changes={changes}
                            actor={actor}
                            onActorChange={(next) => {
                              setActorKindChoice(next.kind);
                              setTypedActorId(next.id);
                            }}
                            onListStale={list.refresh}
                            accepted={accepted?.orderId === order.order_id ? accepted.to : undefined}
                            onAccepted={(to) => setAccepted(to ? { orderId: order.order_id, to } : undefined)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>
      </PageHeader>
    </section>
  );
}
