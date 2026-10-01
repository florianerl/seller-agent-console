import type { ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { agents, approvals, curators, deals, openProposals, orders, packages, products } from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { TipField } from "../components/TipField";
import { CADENCE } from "../query/cadence";
import { useOpenProposalSupport } from "../query/useOpenProposalSupport";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * Pick an id from what the agent already holds, instead of pasting one from
 * another screen. The id used to be a bare text box, and the only way to learn
 * what belonged in it was to be refused with a 404.
 *
 * Free text stays allowed. A list can be short (a product list is capped, a
 * buyer key may not be allowed to read it at all) and a picker that cannot be
 * typed past would lock the form on exactly the day the list is unavailable.
 * The list is a suggestion, never a gate.
 *
 * Each picker reads under the same cache key as the screen that lists the same
 * thing, so opening a form costs no second request.
 */
export type PickerOption = { id: string; title?: string | undefined; detail?: string | undefined };

function EntityPicker({
  label,
  hint,
  value,
  onChange,
  options,
  loading,
  result,
  empty,
  disabled,
  sx,
}: {
  label: string;
  hint: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: readonly PickerOption[];
  loading: boolean;
  result: Result<unknown> | undefined;
  /** What to say when the list loaded and is empty: where such things come from. */
  empty: string;
  disabled?: boolean | undefined;
  sx?: SxProps<Theme> | undefined;
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  return (
    <Autocomplete
      freeSolo
      openOnFocus
      size="small"
      options={options.map((o) => o.id)}
      inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      // Match on the name and detail as well as the id: nobody remembers ids.
      filterOptions={(ids, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (!q) return ids;
        return ids.filter((id) => {
          const o = byId.get(id);
          return [id, o?.title, o?.detail].some((t) => t?.toLowerCase().includes(q));
        });
      }}
      loading={loading}
      disabled={disabled ?? false}
      sx={sx ?? { minWidth: 240 }}
      noOptionsText={
        result && result.kind !== "ok" ? `${describe(result)} — type an id instead.` : empty
      }
      renderOption={(props, id) => {
        const o = byId.get(id);
        return (
          <li {...props} key={id}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{id}</Box>
              {(o?.title || o?.detail) && (
                <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {[o.title, o.detail].filter(Boolean).join(" · ")}
                </Box>
              )}
            </Box>
          </li>
        );
      }}
      renderInput={(params) => <TipField {...params} hint={hint} label={label} />}
    />
  );
}

type PickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: ReactNode;
  disabled?: boolean;
  sx?: SxProps<Theme>;
};

export function ProductPicker({ label = "Product id", hint, ...rest }: PickerProps) {
  const list = useResource("products", (c, signal) => products(c, { limit: 200 }, signal), {
    refreshInterval: CADENCE.rateCard,
  });
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint ?? "A product from the catalog. Pick one, or type or paste an id."}
      options={(list.data?.products ?? []).map((p) => ({
        id: p.product_id,
        title: p.name,
        detail: p.delivery_type ?? undefined,
      }))}
      loading={list.loading}
      result={list.result}
      empty="The catalog has no products."
    />
  );
}

export function PackagePicker({ label = "Package id", hint, ...rest }: PickerProps) {
  const list = useResource("packages", packages, { refreshInterval: CADENCE.rateCard });
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint ?? "A package from the Packages list. Pick one, or type or paste an id."}
      options={(list.data?.packages ?? []).map((p) => ({
        id: p.package_id,
        title: p.name,
        detail: p.rate_type ?? undefined,
      }))}
      loading={list.loading}
      result={list.result}
      empty="No packages yet."
    />
  );
}

export function OrderPicker({ label = "Order id", hint, ...rest }: PickerProps) {
  const list = useResource("orders:", (c, signal) => orders(c, {}, signal), {
    refreshInterval: CADENCE.orders,
  });
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint ?? "An order from the Orders list. Pick one, or type or paste an id."}
      options={(list.data?.orders ?? []).map((o) => ({
        id: o.order_id,
        title: o.status,
      }))}
      loading={list.loading}
      result={list.result}
      empty="No orders yet."
    />
  );
}

export function AgentPicker({ label = "Agent id", hint, ...rest }: PickerProps) {
  const list = useResource("agents::", (c, signal) => agents(c, {}, signal));
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint ?? "An agent from the Agents list. Pick one, or type or paste an id."}
      options={(list.data?.agents ?? []).map((a) => ({
        id: a.agent_id,
        title: a.agent_card?.name || undefined,
        detail: `${a.agent_type} · ${a.trust_status}`,
      }))}
      loading={list.loading}
      result={list.result}
      empty="No agents registered."
    />
  );
}

export function CuratorPicker({ label = "Curator", hint, ...rest }: PickerProps) {
  const list = useResource("curators", (c, signal) => curators(c, signal), {
    refreshInterval: CADENCE.curators,
  });
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={
        hint ??
        "A curator registered with this agent. Register one on the Curators screen first if the list is empty."
      }
      options={(list.data?.curators ?? []).map((k) => ({
        id: k.curator_id,
        title: k.name,
        detail: [k.domain, k.is_active ? "" : "inactive"].filter(Boolean).join(" · "),
      }))}
      loading={list.loading}
      result={list.result}
      empty="No curators registered. Register one on the Curators screen."
    />
  );
}

/** Gates still waiting. A decided gate is not in the queue — type its id from the event. */
export function GatePicker({ label = "Gate id", hint, ...rest }: PickerProps) {
  const list = useResource("approvals", approvals, { refreshInterval: CADENCE.orders });
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint}
      options={(list.data?.approvals ?? []).map((a) => ({ id: a.approval_id }))}
      loading={list.loading}
      result={list.result}
      empty="No gates are waiting. Paste the id of a decided one instead."
    />
  );
}

/**
 * Stored deals. Mount it only when asked: the deals list is an unpaginated
 * full scan (`CADENCE.deals` is 0), so a form that opens with this would
 * trigger one every time. It shares the Deals screen's cache entry, so a
 * list already loaded there costs nothing here.
 */
export function DealPicker({ label = "Deal", hint, ...rest }: PickerProps) {
  const list = useResource("deals:", (c, signal) => deals(c, {}, signal));
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint ?? "A stored deal. Pick one, or type or paste a deal id."}
      options={(list.data?.deals ?? []).map(({ deal }) => ({
        id: deal.deal_id,
        title: deal.product?.name || undefined,
        detail: [deal.deal_type, deal.status].filter(Boolean).join(" · "),
      }))}
      loading={list.loading}
      result={list.result}
      empty="No stored deals. Book one on the Deals screen, or type a deal id."
    />
  );
}

/**
 * Proposals the agent can list. The legacy `/proposals` routes this form
 * drives have no list endpoint, so the only enumerable source is the
 * OpenProposal list — read only when the agent card advertises it, to keep a
 * 2.x agent free of `/api/v3` traffic (ADR 14). `known` carries ids the
 * caller already holds, such as one just submitted, which no list returns.
 */
function OpenProposalOptions(props: PickerProps & { known: readonly string[] }) {
  const { known, label = "Proposal id", hint, ...rest } = props;
  // Same key and page size as the Proposals screen's unfiltered list.
  const list = useResource("open-proposals::", (c, signal) => openProposals(c, { limit: 50, offset: 0 }, signal), {
    refreshInterval: CADENCE.proposals,
  });
  const listed = (list.data?.proposals.items ?? []).map((p) => ({
    id: p.proposal_id,
    title: p.description || undefined,
    detail: [p.type, p.status].filter(Boolean).join(" · "),
  }));
  const ids = new Set(listed.map((o) => o.id));
  const options = [...known.filter((id) => !ids.has(id)).map((id) => ({ id, title: "Submitted in this session" })), ...listed];
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={hint}
      options={options}
      loading={list.loading}
      result={list.result}
      empty="No proposals listed. Submit one above, or type an id."
    />
  );
}

export function ProposalPicker({ known = [], label = "Proposal id", hint, ...rest }: PickerProps & { known?: readonly string[] }) {
  const { support } = useOpenProposalSupport();
  const shared =
    hint ?? "Proposal to counter or check. Pick one, or type or paste an id (the agent has no list of legacy proposals).";
  if (support === "supported") return <OpenProposalOptions {...rest} known={known} label={label} hint={shared} />;
  return (
    <EntityPicker
      {...rest}
      label={label}
      hint={shared}
      options={known.map((id) => ({ id, title: "Submitted in this session" }))}
      loading={false}
      result={undefined}
      empty="This agent lists no proposals. Submit one above, or paste an id."
    />
  );
}
