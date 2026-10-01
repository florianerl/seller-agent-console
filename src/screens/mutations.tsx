import { useState, type ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  agentById,
  applyChangeRequest,
  apiKeyById,
  assemblePackage,
  audienceMatch,
  bulkDealOperations,
  closeSession,
  counterProposal,
  createBuyerApiKey,
  createChangeRequest,
  createOperatorApiKey,
  createOrder,
  createPackage,
  createQuote,
  createSession,
  dealBuyerStatus,
  dealById,
  dealSspTroubleshoot,
  deleteInventoryTypeOverride,
  deletePackage,
  deprecateDeal,
  discoverAgent,
  distributeDeal,
  eventById,
  migrateDeal,
  negotiationStatus,
  packageById,
  postNegotiationMessage,
  pushDeal,
  putRateCard,
  registerCurator,
  removeRegisteredAgent,
  reviewChangeRequest,
  revokeApiKey,
  sendSessionMessage,
  setInventoryTypeOverride,
  submitProposal,
  syncPackages,
  transitionOrder,
  triggerInventorySync,
  updateAgentTrust,
  updatePackage,
  assentProposal,
  holdLineItem,
  publishProposal,
  withdrawProposal,
  type CreatedApiKey,
  type BulkDealResponse,
  type ChangeRequestAck,
  type ChangeRequestReviewInput,
  type LineItem,
  type Order,
  type Proposal,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import {
  RECORD_ONLY,
  actorClaim,
  isOrderStatus,
  nextSteps,
  predictSeverity,
  refuseChange,
  type NextStep,
  type OrderActor,
} from "../api/order-lifecycle";
import {
  ACTOR_KINDS,
  BULK_DEAL_ACTIONS,
  CHANGE_TYPES,
  DEAL_TYPES,
  INVENTORY_TYPES,
  LEGACY_DEAL_TYPES,
  QUOTE_MEDIA_TYPES,
  SSP_NAMES,
  words,
  type BulkDealAction,
  type DealTypeCode,
  type QuoteMediaType,
} from "../api/vocabulary";
import { ConfirmAction } from "../components/ConfirmAction";
import { EnumSelect } from "../components/EnumSelect";
import { Hint } from "../components/Hint";
import { TipField } from "../components/TipField";
import { AgentPicker, DealPicker, OrderPicker, PackagePicker, ProductPicker } from "./pickers";
import { JsonView } from "../components/JsonView";
import { FormFields, FormRow, ReadForm, WriteForm } from "../components/WriteForm";
import { WritesNotice } from "../components/WritesNotice";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

function newKey(): string {
  return crypto.randomUUID();
}

/**
 * One thing an operator can do, laid out like a settings row: what it is on the
 * left, its controls on the right. Stacked controls under a title read as a
 * wall of identical form rows; two columns lets the eye run down the titles
 * alone and only stop at the control it wants. It collapses to one column on a
 * narrow screen.
 */
function ActionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        // By the width of the card or panel it sits in, not of the page: the
        // same row is wide in a page-level panel and narrow in half a deal.
        gridTemplateColumns: "minmax(0, 1fr)",
        "@container (min-width: 560px)": {
          gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
        },
        columnGap: 4,
        rowGap: 1,
        alignItems: "start",
        py: 2,
        borderTop: `1px solid ${palette.line}`,
        "&:first-of-type": { borderTop: 0, pt: 0 },
        "&:last-of-type": { pb: 0 },
      }}
    >
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" component="p" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

// Bulk "create" is left out: it books a deal from a quote, which "Book from a
// quote" does with an idempotency key, and it is the one bulk action that takes
// no deal id, so it never fitted a form that acts on a deal.
const DEAL_EDIT_ACTIONS = BULK_DEAL_ACTIONS.filter((o) => o.value !== "create");

/**
 * What a read came back with: the value as highlighted JSON, or the reason
 * there is none. Shared so every lookup shows a result the same way.
 */
function ReadOutcome({
  name,
  data,
  result,
}: {
  name: string;
  data: unknown;
  result: Result<unknown> | undefined;
}) {
  if (data === undefined || data === null) {
    return (
      <Typography variant="caption" component="p">
        {result ? `${name}: ${describe(result)}` : ""}
      </Typography>
    );
  }
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" component="p" color="text.secondary" sx={{ mb: 0.5 }}>
        {name}
      </Typography>
      <JsonView value={data} />
    </Box>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, mb: 2.5, containerType: "inline-size" }}
      data-block="operator-writes"
    >
      <Typography variant="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export function InventorySyncWrite() {
  const { writesEnabled } = useCredential();
  const [incremental, setIncremental] = useState(false);
  const run = useMutation<{ incremental: boolean }, unknown>(
    (c, args) => triggerInventorySync(c, args),
    { invalidates: ["inventory-sync", "inventory-watermark"] },
  );

  return (
    <WriteForm
      title="Trigger an inventory sync?"
      confirmLabel="Sync now"
      action="trigger-sync"
      blocked={!writesEnabled}
      pending={run.pending}
      last={run.last}
      onConfirm={() => void run.run({ incremental })}
      consequence={
        <>
          Each trigger starts another pass against the ad server. It is not
          idempotent: a retry after an unclear failure may run a second sync.
          Incremental uses the stored watermark when one exists.
        </>
      }
    >
      <TipField
        hint="How much to sync. Full re-reads everything from the ad server; Incremental starts from the stored watermark when one exists."
        select
        size="small"
        label="Mode"
        value={incremental ? "incremental" : "full"}
        onChange={(e) => setIncremental(e.target.value === "incremental")}
        disabled={!writesEnabled || run.pending}
        sx={{ minWidth: 180 }}
      >
        <MenuItem value="full">Full</MenuItem>
        <MenuItem value="incremental">Incremental</MenuItem>
      </TipField>
    </WriteForm>
  );
}

export function ApiKeyWrites() {
  const { writesEnabled } = useCredential();
  const [label, setLabel] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [secret, setSecret] = useState<CreatedApiKey | undefined>();

  const buyer = useMutation<{ label?: string }, CreatedApiKey>(
    (c, args) => createBuyerApiKey(c, args),
    { invalidates: ["api-keys"] },
  );
  const operator = useMutation<{ label?: string }, CreatedApiKey>(
    (c, args) => createOperatorApiKey(c, args),
    { invalidates: ["api-keys"] },
  );
  const revoke = useMutation<{ id: string }, unknown>(
    (c, args) => revokeApiKey(c, args.id),
    { invalidates: ["api-keys", `api-key:${revokeId}`] },
  );

  function showSecret(result: { kind: string; data?: CreatedApiKey }) {
    if (result.kind === "ok" && result.data) setSecret(result.data);
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Creating a key returns the secret once. It is shown here and never
        stored in this console.
      </Typography>
      <WriteForm
        title="Mint a buyer API key?"
        confirmLabel="Create buyer key"
        action="create-buyer-key"
        blocked={!writesEnabled}
        pending={buyer.pending}
        last={buyer.last}
        onConfirm={() =>
          void buyer.run({ ...(label ? { label } : {}) }).then(showSecret)
        }
        consequence={
          <>
            Not idempotent: each call mints a new key. The secret is in this
            response only. A failure leaves a key that exists or does not —
            re-read the list before minting again.
          </>
        }
      >
        <TipField
          hint="Optional name for the new buyer key, so you can tell keys apart in the list. Leave empty for an unlabelled key."
          size="small"
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!writesEnabled}
          sx={{ minWidth: 220 }}
        />
      </WriteForm>
      <WriteForm
        title="Mint an operator API key?"
        confirmLabel="Create operator key"
        action="create-operator-key"
        blocked={!writesEnabled}
        pending={operator.pending}
        last={operator.last}
        onConfirm={() =>
          void operator.run({ ...(label ? { label } : {}) }).then(showSecret)
        }
        consequence={
          <>
            Not idempotent. Some agents 409 if an extra operator key already
            exists. The secret is in this response only.
          </>
        }
      />
      <WriteForm
        title="Revoke this API key?"
        confirmLabel="Revoke key"
        action="revoke-key"
        blocked={!writesEnabled || !revokeId.trim()}
        pending={revoke.pending}
        last={revoke.last}
        onConfirm={() => void revoke.run({ id: revokeId.trim() })}
        consequence={
          <>
            The key stops working. A second revoke 404s. If this fails without
            a clear answer, re-read the key rather than assuming it is dead.
          </>
        }
      >
        <TipField
          hint="Id of the key to revoke, as shown in the API keys list (the key_id, not the secret)."
          size="small"
          label="Key id"
          value={revokeId}
          onChange={(e) => setRevokeId(e.target.value)}
          disabled={!writesEnabled}
          sx={{ minWidth: 220 }}
        />
      </WriteForm>
      {secret?.api_key ? (
        <Box
          component="pre"
          data-block="one-time-secret"
          sx={{ p: 1.5, fontSize: 12, backgroundColor: palette.ground, overflow: "auto" }}
        >
          {`key_id ${secret.key_id}\nrole ${secret.role}\n${secret.api_key}`}
        </Box>
      ) : null}
    </Stack>
  );
}

export function CatalogWrites() {
  const { writesEnabled } = useCredential();
  const [productId, setProductId] = useState("");
  // Unvalidated upstream, so a typo would be stored and then match no
  // product. The documented set is offered instead of a text box.
  const [inventoryType, setInventoryType] = useState<string>("display");
  const [reason, setReason] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [pkgPrice, setPkgPrice] = useState("10");
  const [pkgFloor, setPkgFloor] = useState("5");
  const [pkgId, setPkgId] = useState("");
  const [productIds, setProductIds] = useState("");
  const [cpm, setCpm] = useState("12");
  const [rateType, setRateType] = useState<string>("display");

  // The name must be the one ProductDetail (Catalog.tsx) reads, built from
  // the id the call acted on — the trimmed one — not the raw field.
  const setOverride = useMutation<
    { productId: string; inventory_type: string; reason?: string },
    unknown
  >(
    (c, args) =>
      setInventoryTypeOverride(c, args.productId, {
        product_id: args.productId,
        inventory_type: args.inventory_type,
        ...(args.reason ? { reason: args.reason } : {}),
      }),
    { invalidates: (args) => [`inventory-type:${args.productId}`] },
  );
  const clearOverride = useMutation<{ productId: string }, unknown>(
    (c, args) => deleteInventoryTypeOverride(c, args.productId),
    { invalidates: (args) => [`inventory-type:${args.productId}`] },
  );
  const rate = useMutation<
    { inventory_type: string; base_cpm: number },
    unknown
  >(
    (c, args) => putRateCard(c, [args]),
    { invalidates: ["rate-card"] },
  );
  const createPkg = useMutation<
    { name: string; base_price: number; floor_price: number },
    unknown
  >((c, args) => createPackage(c, args), { invalidates: ["packages"] });
  const updatePkg = useMutation<{ id: string; name: string }, unknown>(
    (c, args) => updatePackage(c, args.id, { name: args.name }),
    { invalidates: (args) => ["packages", `package:${args.id}`] },
  );
  const deletePkg = useMutation<{ id: string }, unknown>(
    (c, args) => deletePackage(c, args.id),
    { invalidates: ["packages"] },
  );
  const assemble = useMutation<{ name: string; product_ids: string[] }, unknown>(
    (c, args) => assemblePackage(c, args),
    { invalidates: ["packages"] },
  );
  const sync = useMutation<Record<string, never>, unknown>((c) => syncPackages(c), {
    invalidates: ["packages"],
  });

  const blocked = !writesEnabled;

  return (
    <Stack spacing={2}>
      <WriteForm
        title="Replace the stored rate card?"
        confirmLabel="Put rate card"
        action="put-rate-card"
        blocked={blocked}
        pending={rate.pending}
        last={rate.last}
        onConfirm={() =>
          void rate.run({ inventory_type: rateType, base_cpm: Number(cpm) })
        }
        consequence={
          <>
            This is a replace, not a merge. The previous card is gone if the
            call succeeds, and still there if it fails. A retry after an
            unclear failure may or may not have already replaced it.
          </>
        }
      >
        <FormFields>
          <EnumSelect
            hint="Which inventory type this rate applies to. Choose from the types the agent documents."
            label="Inventory type"
            value={rateType}
            options={INVENTORY_TYPES}
            onChange={(v) => v && setRateType(v)}
            disabled={blocked}
            sx={{ minWidth: 160 }}
          />
          <TipField
            hint="Base CPM for the chosen inventory type, as a plain number in dollars per thousand impressions, for example 12."
            size="small"
            label="Base CPM"
            value={cpm}
            onChange={(e) => setCpm(e.target.value)}
            disabled={blocked}
          />
        </FormFields>
      </WriteForm>
      <WriteForm
        title="Set an inventory type override?"
        confirmLabel="Set override"
        action="set-override"
        blocked={blocked || !productId.trim()}
        pending={setOverride.pending}
        last={setOverride.last}
        onConfirm={() =>
          void setOverride.run({
            productId: productId.trim(),
            inventory_type: inventoryType,
            ...(reason ? { reason } : {}),
          })
        }
        consequence="The override persists across inventory syncs. A second set replaces the first."
      >
        <FormFields>
          <ProductPicker value={productId} onChange={setProductId} disabled={blocked} />
          <EnumSelect
            hint="Inventory type to force on the product. It replaces the auto-detected type and survives inventory syncs."
            label="Inventory type"
            value={inventoryType}
            options={INVENTORY_TYPES}
            onChange={(v) => v && setInventoryType(v)}
            disabled={blocked}
            sx={{ minWidth: 160 }}
          />
          <TipField
            hint="Optional note on why the type is being overridden. Sent only when filled in."
            size="small"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={blocked}
          />
        </FormFields>
      </WriteForm>
      <WriteForm
        title="Delete this inventory type override?"
        confirmLabel="Delete override"
        action="delete-override"
        blocked={blocked || !productId.trim()}
        pending={clearOverride.pending}
        last={clearOverride.last}
        onConfirm={() => void clearOverride.run({ productId: productId.trim() })}
        consequence="The product reverts to the auto-detected type. A second delete 404s."
      />
      <WriteForm
        title="Create a curated package?"
        confirmLabel="Create package"
        action="create-package"
        blocked={blocked || !pkgName.trim()}
        pending={createPkg.pending}
        last={createPkg.last}
        onConfirm={() =>
          void createPkg.run({
            name: pkgName.trim(),
            base_price: Number(pkgPrice),
            floor_price: Number(pkgFloor),
          })
        }
        consequence="Not idempotent: each call mints a new package id."
      >
        <FormFields>
          <TipField hint="Name of the new package. Also used as the name when assembling a dynamic package or renaming one." size="small" label="Name" value={pkgName} onChange={(e) => setPkgName(e.target.value)} disabled={blocked} />
          <TipField hint="Base (list) price for the package as a plain number, for example 10. Sent as base_price." size="small" label="Base price" value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} disabled={blocked} />
          <TipField hint="Lowest price the package may be sold at, as a plain number, for example 5. Sent as floor_price." size="small" label="Floor" value={pkgFloor} onChange={(e) => setPkgFloor(e.target.value)} disabled={blocked} />
        </FormFields>
      </WriteForm>
      <WriteForm
        title="Rename this package?"
        confirmLabel="Update package"
        action="update-package"
        blocked={blocked || !pkgId.trim() || !pkgName.trim()}
        pending={updatePkg.pending}
        last={updatePkg.last}
        onConfirm={() => void updatePkg.run({ id: pkgId.trim(), name: pkgName.trim() })}
        consequence="The named fields are overwritten. A missing id 404s."
      >
        <PackagePicker value={pkgId} onChange={setPkgId} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Archive this package?"
        confirmLabel="Delete package"
        action="delete-package"
        blocked={blocked || !pkgId.trim()}
        pending={deletePkg.pending}
        last={deletePkg.last}
        onConfirm={() => void deletePkg.run({ id: pkgId.trim() })}
        consequence="Soft-delete: the package is archived. A second delete 404s."
      />
      <WriteForm
        title="Assemble a dynamic package?"
        confirmLabel="Assemble"
        action="assemble-package"
        blocked={blocked || !pkgName.trim() || !productIds.trim()}
        pending={assemble.pending}
        last={assemble.last}
        onConfirm={() =>
          void assemble.run({
            name: pkgName.trim(),
            product_ids: productIds.split(",").map((id) => id.trim()).filter(Boolean),
          })
        }
        consequence="Not idempotent. Unresolvable product ids 422."
      >
        <TipField
          hint="Ids of the products to combine, separated by commas. Ids that do not resolve to a product are rejected with a 422."
          size="small"
          label="Product ids (comma-separated)"
          value={productIds}
          onChange={(e) => setProductIds(e.target.value)}
          disabled={blocked}
          sx={{ minWidth: 280 }}
        />
      </WriteForm>
      <WriteForm
        title="Sync packages from the ad server?"
        confirmLabel="Sync packages"
        action="sync-packages"
        blocked={blocked}
        pending={sync.pending}
        last={sync.last}
        onConfirm={() => void sync.run({})}
        consequence="Not idempotent: each trigger kicks ProductSetupFlow again."
      />
    </Stack>
  );
}

export function CreateQuoteWrite() {
  const { writesEnabled } = useCredential();
  const [productId, setProductId] = useState("");
  const [dealType, setDealType] = useState<DealTypeCode>("PD");
  const [mediaType, setMediaType] = useState<QuoteMediaType>("digital");
  const [impressions, setImpressions] = useState("");
  // `QuoteRequest` says impressions are required for PG; the others take none.
  const volume = Number(impressions);
  const needsVolume = dealType === "PG";
  const volumeOk = Number.isInteger(volume) && volume > 0;
  const create = useMutation<
    {
      product_id: string;
      idempotency_key: string;
      deal_type: DealTypeCode;
      media_type: QuoteMediaType;
      impressions?: number;
    },
    unknown
  >((c, args) => createQuote(c, args));

  return (
    <WriteForm
      title="Request a quote?"
      confirmLabel="Create quote"
      action="create-quote"
      blocked={!writesEnabled || !productId.trim() || (needsVolume && !volumeOk)}
      pending={create.pending}
      last={create.last}
      onConfirm={() =>
        void create.run({
          product_id: productId.trim(),
          idempotency_key: newKey(),
          deal_type: dealType,
          media_type: mediaType,
          ...(needsVolume ? { impressions: volume } : {}),
        })
      }
      consequence={
        <>
          Quotes are ephemeral (24h TTL) and non-binding. The same idempotency
          key with the same body returns the original quote; a different body
          with that key 409s.
        </>
      }
    >
      <FormFields>
        <ProductPicker value={productId} onChange={setProductId} disabled={!writesEnabled} />
        <EnumSelect
          hint="PG is guaranteed and needs an impression count; PD (preferred) and PA (private auction) do not."
          label="Deal type"
          value={dealType}
          options={DEAL_TYPES}
          onChange={(v) => v && setDealType(v)}
          disabled={!writesEnabled}
          sx={{ minWidth: 220 }}
        />
        <EnumSelect
          hint="Media type the quote is for. The agent accepts only the listed values."
          label="Media type"
          value={mediaType}
          options={QUOTE_MEDIA_TYPES}
          onChange={(v) => v && setMediaType(v)}
          disabled={!writesEnabled}
          sx={{ minWidth: 140 }}
        />
        {needsVolume && (
          <TipField
            hint="Number of impressions to quote. Required for a guaranteed (PG) quote and a whole number above zero; other deal types send none."
            size="small"
            type="number"
            label="Impressions"
            value={impressions}
            onChange={(e) => setImpressions(e.target.value)}
            disabled={!writesEnabled}
          />
        )}
      </FormFields>
    </WriteForm>
  );
}

export function PackageLookup() {
  const [id, setId] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <Box sx={{ mt: 1 }} data-block="package-lookup">
      <FormRow>
        <PackagePicker value={id} onChange={setId} />
        <ReadForm
          label="Load package"
          action="fetch-package"
          disabled={!id.trim()}
          onRun={() => setSubmitted(id.trim())}
        />
      </FormRow>
      {submitted && <PackageBody packageId={submitted} />}
    </Box>
  );
}

function PackageBody({ packageId }: { packageId: string }) {
  const pkg = useResource(`package:${packageId}`, (c, signal) => packageById(c, packageId, signal));
  return (
    <Typography variant="body2" sx={{ mt: 1 }}>
      {pkg.data?.name ?? (pkg.result ? describe(pkg.result) : "")}
    </Typography>
  );
}

export function OrderCreateWrite({ onCreated }: { onCreated?: (orderId: string) => void }) {
  const { writesEnabled } = useCredential();
  const [dealId, setDealId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [pickDeal, setPickDeal] = useState(false);

  const create = useMutation<
    { deal_id?: string; quote_id?: string; metadata: Record<string, unknown> },
    Order
  >(
    (c, args) => createOrder(c, args),
    { invalidates: ["orders:*", "orders-report"] },
  );

  return (
    <WriteForm
      title="Create a draft order?"
      confirmLabel="Create order"
      action="create-order"
      blocked={!writesEnabled}
      pending={create.pending}
      last={create.last}
      onConfirm={() =>
        void create
          .run({
            ...(dealId.trim() ? { deal_id: dealId.trim() } : {}),
            ...(quoteId.trim() ? { quote_id: quoteId.trim() } : {}),
            // Buyer agents tag their orders with a source; so does the
            // console, or its orders would read as "source not recorded".
            metadata: { source: "seller-console" },
          })
          .then((result) => {
            if (result.kind === "ok") onCreated?.(result.data.order_id);
          })
      }
      consequence={
        <>
          Creates an order in <strong>draft</strong>
          {dealId.trim() ? <> for deal {dealId.trim()}</> : <> with no deal attached</>}. Not
          idempotent: each call mints a new order id, so a retry after a timeout may leave two
          drafts.
        </>
      }
    >
      <FormFields>
        {pickDeal ? (
          <DealPicker
            value={dealId}
            onChange={setDealId}
            disabled={!writesEnabled}
            hint="Optional deal to attach. Pick one of the stored deals, or type or paste a deal id."
            sx={{ minWidth: 320 }}
          />
        ) : (
          <TipField
            hint="Optional id of the deal the order is for. Leave empty for an order with no deal attached."
            size="small"
            label="Deal id (optional)"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            disabled={!writesEnabled}
          />
        )}
        <TipField
          hint="Optional id of the quote the order was priced from. It links to the Quotes screen."
          size="small"
          label="Quote id (optional)"
          value={quoteId}
          onChange={(e) => setQuoteId(e.target.value)}
          disabled={!writesEnabled}
        />
        {!pickDeal && (
          <Hint hint="Switches the deal box to a list of stored deals. This loads every stored deal, so it only runs when you click.">
            <Button
              size="small"
              onClick={() => setPickDeal(true)}
              disabled={!writesEnabled}
              data-action="choose-deal"
              sx={{ flexShrink: 0 }}
            >
              Choose from deals
            </Button>
          </Hint>
        )}
      </FormFields>
    </WriteForm>
  );
}

/**
 * The legal next moves for one order, one button each. The move table is a
 * copy of upstream's (see order-lifecycle.ts), so a 409 means the order moved
 * under the operator or the table drifted; either way nothing was applied and
 * the order is re-read.
 */
export function OrderTransitionWrites({
  orderId,
  status,
  actor,
  onActorChange,
  onStale,
  accepted,
  onAccepted,
  adServer,
}: {
  orderId: string;
  status: string;
  actor: OrderActor;
  onActorChange: (actor: OrderActor) => void;
  onStale: () => void;
  /** The last move the agent accepted here. Owned by the caller: see onAccepted. */
  accepted: string | undefined;
  /**
   * A successful move invalidates the order list, which empties it until the
   * re-read lands and unmounts this row with it. Anything said about the move
   * has to live above the table to still be on screen afterwards.
   */
  onAccepted: (to: string | undefined) => void;
  /**
   * What GAM showed for this order's deal, if someone checked. Quoted in the
   * confirmation of every record-only move, because that move is a claim
   * about the ad server and this is the only evidence the console has.
   */
  adServer?: string;
}) {
  const { writesEnabled, credential, setActorName } = useCredential();
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState<string | undefined>();
  const steps = nextSteps(status);
  const claim = actorClaim(actor);

  const transition = useMutation<{ to_status: string; actor: string; reason?: string }, unknown>(
    (c, args) => transitionOrder(c, orderId, args),
    { invalidates: ["orders:*", `order-audit:${orderId}`, "orders-report"] },
  );

  if (steps.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-state="no-next-step">
        {isOrderStatus(status)
          ? "No further transitions from here."
          : `This console does not know the status "${words(status)}", so it offers no transition.`}
      </Typography>
    );
  }

  // Upstream gates this route on an operator key. A buyer key would only
  // ever collect a 403, so say that instead of offering the buttons.
  if (credential?.role === "buyer") {
    return (
      <Typography variant="body2" color="text.secondary" data-state="operator-only">
        Moving an order needs an operator key; this one is a buyer key.
      </Typography>
    );
  }

  const moved =
    transition.last?.kind === "unavailable" &&
    transition.last.reason === "http" &&
    transition.last.status === 409;
  // The 409 body names the moves that are legal now; the screen's own table
  // may be the thing that is out of date.
  const allowedNow = problemList(transition.last, "allowed_transitions");

  const go = (to: string) => {
    if (!claim) return;
    setChosen(to);
    // A new attempt supersedes whatever the last one said.
    onAccepted(undefined);
    void transition
      .run({ to_status: to, actor: claim, ...(reason.trim() ? { reason: reason.trim() } : {}) })
      .then((result) => {
        if (result.kind === "ok") {
          setReason("");
          onAccepted(to);
        }
        if (result.kind === "unavailable" && result.reason === "http" && result.status === 409) {
          onStale();
        }
      });
  };

  const button = (step: NextStep) => (
    <WriteForm
      key={step.to}
      // One obvious move: the forward step is the filled button, and ways
      // off the path are quiet text, so the one a hurried operator hits is
      // never the one that cancels.
      variant={step.kind === "forward" ? "contained" : "text"}
      color={step.kind === "forward" ? "primary" : "inherit"}
      title={`${step.label}?`}
      confirmLabel={step.label}
      action={`transition-order:${step.to}`}
      blocked={!writesEnabled || !claim || (transition.pending && chosen !== step.to)}
      pending={transition.pending && chosen === step.to}
      // Success is reported below the buttons: the button that was pressed
      // is gone once the order has moved.
      last={chosen === step.to && !moved && transition.last?.kind !== "ok" ? transition.last : undefined}
      onConfirm={() => go(step.to)}
      consequence={
        <>
          Moves {orderId} from <strong>{words(status)}</strong> to{" "}
          <strong>{words(step.to)}</strong>, recorded as {claim ?? "?"}
          {reason.trim() ? <> with the reason &ldquo;{reason.trim()}&rdquo;</> : null}. The agent
          describes this move as &ldquo;{step.description}&rdquo;.
          {step.kind === "stop" && " It takes the order off its path."}
          {(step.to === "cancelled" || step.to === "completed") &&
            " This is terminal: no transition leads out of it."}
          {RECORD_ONLY.has(step.to) && (
            <>
              {" "}
              <strong>Nothing is sent to the ad server</strong>: the agent has no ad-server sync, so
              this only records the status on the order.{" "}
              {adServer ? `GAM, when checked: ${adServer}` : "The ad server has not been checked from here."}
            </>
          )}{" "}
          Not idempotent: re-read the order before retrying after a timeout.
        </>
      }
    />
  );

  const forward = steps.filter((s) => s.kind === "forward");
  const other = steps.filter((s) => s.kind !== "forward");

  return (
    <Stack spacing={2} data-block="order-transitions">
      <FormRow>
        <EnumSelect
          hint="Who the move is recorded as: a person, an agent or the system. Not verified by the agent."
          label="Acting as"
          value={actor.kind}
          options={ACTOR_KINDS}
          onChange={(kind) => kind && onActorChange({ ...actor, kind })}
          disabled={!writesEnabled}
          sx={{ minWidth: 140 }}
        />
        {actor.kind !== "system" && (
          <TipField
            hint="Who the move is recorded as. The agent stores this as claimed and does not verify it."
            size="small"
            label={actor.kind === "human" ? "Your name or id" : "Agent id"}
            value={actor.id}
            onChange={(e) => onActorChange({ ...actor, id: e.target.value })}
            // Only a person's name is remembered: an agent id is a one-off
            // claim about someone else.
            onBlur={() => {
              if (actor.kind === "human") void setActorName(actor.id);
            }}
            disabled={!writesEnabled}
          />
        )}
        <TipField
          hint="Optional reason recorded with the move. The placeholder shows how the agent describes the first available step."
          size="small"
          label="Reason (optional)"
          placeholder={steps[0]?.description}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={!writesEnabled}
          sx={{ flex: "1 1 200px" }}
        />
      </FormRow>
      {/* Who and why come first so the buttons read as the last step; the
          fields' own hints say the agent verifies neither. */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {forward.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap data-group="forward">
            {forward.map(button)}
          </Stack>
        )}
        {other.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap data-group="off-path">
            {other.map(button)}
          </Stack>
        )}
      </Stack>
      {writesEnabled && !claim && (
        <Typography variant="caption" color="text.secondary" data-note="actor">
          Enter {actor.kind === "human" ? "your name" : "the agent's id"} to enable these moves.
        </Typography>
      )}
      {accepted && (
        <Typography variant="body2" data-state="write-ok">
          The agent accepted the move to {words(accepted)}.
        </Typography>
      )}
      {moved && (
        <Typography variant="body2" sx={{ color: palette.warningText }} data-state="order-moved">
          The agent refused the move: the order is no longer in {words(status)}
          {allowedNow.length > 0 ? `, and from where it is now it allows ${allowedNow.map(words).join(", ")}` : ""}.
          Nothing was applied; the order has been re-read.
        </Typography>
      )}
    </Stack>
  );
}

export function DealWrites({
  dealId,
  group,
}: {
  dealId: string;
  /** Show one group of a deal's actions, for a tabbed panel. Omitted: all of them. */
  group?: "distribute" | "manage" | "danger";
}) {
  const show = (g: "distribute" | "manage" | "danger") => !group || group === g;
  const { writesEnabled } = useCredential();
  const [buyerUrl, setBuyerUrl] = useState("https://buyer.example");
  const [ssp, setSsp] = useState("");
  const [reason, setReason] = useState("");
  const [deprecateReason, setDeprecateReason] = useState("");
  const id = dealId;
  const [bulkAction, setBulkAction] = useState<BulkDealAction>("cancel");
  const [bulkNotes, setBulkNotes] = useState("");

  const bulk = useMutation<
    { operations: { action: BulkDealAction; deal_id?: string; quote_id?: string; notes?: string }[] },
    BulkDealResponse
  >(
    (c, a) => bulkDealOperations(c, a),
    { invalidates: ["deals:*"] },
  );
  const push = useMutation<{ deal_id: string; buyer_urls: string[] }, unknown>(
    (c, a) => pushDeal(c, a),
    { invalidates: ["deals:*"] },
  );
  const dist = useMutation<{ deal_id: string; ssp_name?: string }, unknown>(
    (c, a) => distributeDeal(c, a),
    { invalidates: ["deals:*"] },
  );
  const migrate = useMutation<{ id: string; reason?: string }, unknown>(
    (c, a) =>
      migrateDeal(c, a.id, { old_deal_id: a.id, ...(a.reason ? { reason: a.reason } : {}) }),
    { invalidates: ["deals:*", `deal-lineage:${id}`] },
  );
  const deprecate = useMutation<{ id: string; reason: string }, unknown>(
    (c, a) => deprecateDeal(c, a.id, { reason: a.reason }),
    { invalidates: ["deals:*"] },
  );

  const blocked = !writesEnabled;

  return (
    <Box>
      {show("distribute") && (
        <>
            <ActionBlock
              title="Notify a buyer"
              description="Sends this deal to a buyer agent at the URL below."
            >
              <WriteForm
                title="Push this deal to a buyer?"
                confirmLabel="Push"
                action="push-deal"
                blocked={blocked}
                pending={push.pending}
                last={push.last}
                onConfirm={() => void push.run({ deal_id: id, buyer_urls: [buyerUrl] })}
                consequence="Notifies the named buyer URLs. A retry may notify twice."
              >
                <TipField hint="Full URL of the buyer agent to notify, for example https://buyer.example. Only this one URL is sent." size="small" label="Buyer URL" value={buyerUrl} onChange={(e) => setBuyerUrl(e.target.value)} disabled={blocked} sx={{ minWidth: 240 }} />
              </WriteForm>
            </ActionBlock>
            <ActionBlock
              title="Send to an SSP"
              description="Pushes this deal to one SSP connector. Leave the name empty to use the agent's default."
            >
              <WriteForm
                title="Distribute this deal to an SSP?"
                confirmLabel="Distribute"
                action="distribute-deal"
                blocked={blocked}
                pending={dist.pending}
                last={dist.last}
                onConfirm={() =>
                  void dist.run({ deal_id: id, ...(ssp ? { ssp_name: ssp } : {}) })
                }
                consequence="A retry may push a second copy to the SSP."
              >
                <SspNameField label="SSP name (optional)" hint="Name of the SSP connector to send the deal to. Pick a known one or type another; an unknown name is a 400 that lists the configured ones." value={ssp} onChange={setSsp} disabled={blocked} />
              </WriteForm>
            </ActionBlock>
        </>
      )}
      {show("manage") && (
        <>
        <ActionBlock
          title="Replace with a new deal"
          description="Creates a successor deal and links the two in this deal's lineage."
        >
          <WriteForm
            title="Migrate this deal?"
            confirmLabel="Migrate"
            action="migrate-deal"
            blocked={blocked}
            pending={migrate.pending}
            last={migrate.last}
            onConfirm={() => void migrate.run({ id, ...(reason ? { reason } : {}) })}
            consequence="Mints a successor and records lineage. A retry may mint a second successor."
          >
            <TipField hint="Optional reason recorded with the migration." size="small" label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={blocked} />
          </WriteForm>
        </ActionBlock>
        </>
      )}
      {show("danger") && (
        <>
        <ActionBlock
          title="Cancel or edit notes"
          description="Cancels this deal, or replaces its notes. Cancelling cannot be undone from this console."
        >
          <WriteForm
            title={`Run a bulk ${bulkAction}?`}
            confirmLabel={bulkAction === "cancel" ? "Cancel deal" : "Update notes"}
            action="bulk-deals"
            blocked={blocked}
            pending={bulk.pending}
            // Reported below instead: a 200 here can still carry failures.
            last={bulk.last?.kind === "ok" ? undefined : bulk.last}
            onConfirm={() =>
              void bulk.run({
                operations: [
                  {
                    action: bulkAction,
                    deal_id: id,
                    ...(bulkNotes.trim() ? { notes: bulkNotes.trim() } : {}),
                  },
                ],
              })
            }
            consequence={
              bulkAction === "cancel"
                ? "Sets the deal to cancelled, with the notes as the cancel reason. Nothing in this console reverses it."
                : "Replaces the deal's notes and stamps updated_at. Partial success is possible in a batch: re-read the list rather than repeating it blindly."
            }
          >
            <FormFields>
              <EnumSelect
                hint="Cancel ends the deal; update replaces its notes."
                label="Action"
                value={bulkAction}
                options={DEAL_EDIT_ACTIONS}
                onChange={(v) => v && setBulkAction(v)}
                disabled={blocked}
                sx={{ minWidth: 140 }}
              />
              <TipField hint="Optional notes. For update they replace the deal's notes; for cancel they become the cancel reason." size="small" label="Notes (optional)" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} disabled={blocked} />
            </FormFields>
          </WriteForm>
          {bulk.last?.kind === "ok" && (
            <Box sx={{ mt: 1 }} data-block="bulk-results">
              {bulk.last.data.results.map((r) => (
                <Typography
                  key={r.index}
                  variant="body2"
                  sx={{ color: r.success ? undefined : palette.error }}
                  data-state={r.success ? "op-ok" : "op-failed"}
                >
                  {r.action} {r.deal_id ?? ""}: {r.success ? "done" : r.error ?? "failed"}
                </Typography>
              ))}
            </Box>
          )}
        </ActionBlock>
        <ActionBlock
          title="Deprecate"
          description="Marks this deal deprecated. A reason is required."
        >
          <WriteForm
            title="Deprecate this deal?"
            confirmLabel="Deprecate"
            action="deprecate-deal"
            blocked={blocked || !deprecateReason.trim()}
            pending={deprecate.pending}
            last={deprecate.last}
            onConfirm={() => void deprecate.run({ id, reason: deprecateReason.trim() })}
            consequence="Marks the deal deprecated. A second deprecate may 409 depending on status."
          >
            <TipField hint="Why the deal is being deprecated. Required; sent to the agent with the request." size="small" label="Reason" value={deprecateReason} onChange={(e) => setDeprecateReason(e.target.value)} disabled={blocked} />
          </WriteForm>
        </ActionBlock>
        </>
      )}
    </Box>
  );
}

/** Reads about one deal. Each is a GET; the first has a side effect worth a line. */
export function DealLookups({ dealId }: { dealId: string }) {
  const [loadRecord, setLoadRecord] = useState(false);

  return (
    <Box data-block="deal-lookups">
      <ActionBlock
        title="Full record"
        description="Reads this deal's stored record. The agent may expire a proposed deal when you read it."
      >
        {loadRecord && <WritesNotice what="GET /api/v1/deals/{id} runs a lazy expiry check and may persist the outcome." />}
        <WriteForm
          title="Fetch this deal record?"
          confirmLabel="Fetch deal"
          action="fetch-deal"
          blocked={false}
          pending={false}
          last={undefined}
          onConfirm={() => setLoadRecord(true)}
          consequence="This GET can expire a proposed deal and save that. Only fetch when you mean to."
        />
        {loadRecord && <DealRecord dealId={dealId} />}
      </ActionBlock>
      <ActionBlock title="Buyer's view" description="How a buyer agent currently sees this deal.">
        <BuyerStatus dealId={dealId} />
      </ActionBlock>
      <ActionBlock title="SSP diagnostics" description="Connector diagnostics for this deal at one SSP.">
        <SspTrouble dealId={dealId} />
      </ActionBlock>
    </Box>
  );
}

function DealRecord({ dealId }: { dealId: string }) {
  const record = useResource(`deal:${dealId}`, (c, signal) => dealById(c, dealId, signal));
  return (
    <Typography variant="body2">
      {record.data?.deal.status ?? (record.result ? describe(record.result) : "")}
    </Typography>
  );
}

function BuyerStatus({ dealId }: { dealId: string }) {
  const [buyerUrl, setBuyerUrl] = useState("https://buyer.example");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <>
      <FormRow>
        <TipField hint="Full URL of the buyer agent whose view of this deal you want to read." size="small" label="Buyer URL" value={buyerUrl} onChange={(e) => setBuyerUrl(e.target.value)} />
        <ReadForm
          label="Buyer status"
          action="deal-buyer-status"
          disabled={!buyerUrl.trim()}
          onRun={() => setSubmitted(buyerUrl.trim())}
        />
      </FormRow>
      {submitted && <BuyerStatusBody dealId={dealId} buyerUrl={submitted} />}
    </>
  );
}

function BuyerStatusBody({ dealId, buyerUrl }: { dealId: string; buyerUrl: string }) {
  const buyer = useResource(`deal-buyer:${dealId}:${buyerUrl}`, (c, signal) =>
    dealBuyerStatus(c, dealId, buyerUrl, signal),
  );
  return (
    <ReadOutcome name="Buyer status" data={buyer.data} result={buyer.result} />
  );
}

/**
 * Which connectors exist is deployment settings, not code, so the known
 * names are suggestions and anything can be typed. An unknown name is a 400
 * that lists the configured ones.
 */
function SspNameField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Autocomplete
      freeSolo
      size="small"
      options={SSP_NAMES}
      inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      disabled={disabled}
      sx={{ minWidth: 200 }}
      renderInput={(params) => <TipField {...params} hint={hint} label={label} />}
    />
  );
}

function SspTrouble({ dealId }: { dealId: string }) {
  // Empty, not a guess: the old "gam" default is no SSP connector, so every
  // troubleshoot sent with it was a 400.
  const [ssp, setSsp] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <>
      <FormRow>
        <SspNameField label="SSP" hint="Name of the SSP connector to diagnose. Pick a known one or type another; an unknown name is a 400 that lists the configured ones." value={ssp} onChange={setSsp} />
        <ReadForm
          label="Troubleshoot"
          action="deal-ssp"
          disabled={!ssp.trim()}
          onRun={() => setSubmitted(ssp.trim())}
        />
      </FormRow>
      {submitted && <SspTroubleBody dealId={dealId} ssp={submitted} />}
    </>
  );
}

function SspTroubleBody({ dealId, ssp }: { dealId: string; ssp: string }) {
  const trouble = useResource(`deal-ssp:${dealId}:${ssp}`, (c, signal) =>
    dealSspTroubleshoot(c, dealId, ssp, signal),
  );
  return (
    <ReadOutcome name="SSP troubleshoot" data={trouble.data} result={trouble.result} />
  );
}

export function SessionWrites({ sessionId }: { sessionId: string }) {
  const { writesEnabled } = useCredential();
  const [message, setMessage] = useState("");
  const send = useMutation<{ id: string; message: string }, unknown>(
    (c, a) => sendSessionMessage(c, a.id, { message: a.message }),
    { invalidates: [`session:${sessionId}`, "sessions:*"] },
  );
  const close = useMutation<{ id: string }, unknown>(
    (c, a) => closeSession(c, a.id),
    { invalidates: [`session:${sessionId}`, "sessions:*"] },
  );

  return (
    <Stack spacing={1}>
      <WriteForm
        title="Send this session message?"
        confirmLabel="Send"
        action="session-message"
        blocked={!writesEnabled || !message.trim()}
        pending={send.pending}
        last={send.last}
        onConfirm={() => void send.run({ id: sessionId, message: message.trim() })}
        consequence="Appends a turn and gets a response. Not idempotent: a retry sends a second message."
      >
        <TipField
          hint="Text sent to the session as the next turn. Required."
          size="small"
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!writesEnabled}
          sx={{ minWidth: 280 }}
        />
      </WriteForm>
      <WriteForm
        title="Close this session?"
        confirmLabel="Close session"
        action="close-session"
        blocked={!writesEnabled}
        pending={close.pending}
        last={close.last}
        onConfirm={() => void close.run({ id: sessionId })}
        consequence="Marks the session closed. A second close may 409."
      />
    </Stack>
  );
}

export function CreateSessionWrite() {
  const { writesEnabled } = useCredential();
  const create = useMutation<Record<string, never>, unknown>((c) => createSession(c, {}), {
    invalidates: ["sessions:*"],
  });
  return (
    <WriteForm
      title="Open a new buyer session?"
      confirmLabel="Create session"
      action="create-session"
      blocked={!writesEnabled}
      pending={create.pending}
      last={create.last}
      onConfirm={() => void create.run({})}
      consequence="Not idempotent: each call mints a session. These routes declare no authentication upstream."
    />
  );
}

export function ProposalWrites() {
  const { writesEnabled } = useCredential();
  const [productId, setProductId] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [price, setPrice] = useState("10");
  // The legacy flow checks this against the product's core DealType values
  // (long form, no underscores). "preferred_deal" matched none of them.
  const [proposalDealType, setProposalDealType] = useState("preferreddeal");
  const submit = useMutation<
    { product_id: string; deal_type: string; price: number; impressions: number; start_date: string; end_date: string },
    unknown
  >((c, a) => submitProposal(c, a));
  const counter = useMutation<{ id: string; buyer_price: number }, unknown>(
    (c, a) => counterProposal(c, a.id, { buyer_price: a.buyer_price }),
  );
  const message = useMutation<
    { idempotency_key: string; action: string; proposal_id: string; buyer_price: { amount_micros: number; currency: string } },
    unknown
  >((c, a) => postNegotiationMessage(c, a));

  return (
    <Stack spacing={2}>
      <WriteForm
        title="Submit a proposal?"
        confirmLabel="Submit proposal"
        action="submit-proposal"
        blocked={!writesEnabled || !productId.trim()}
        pending={submit.pending}
        last={submit.last}
        onConfirm={() =>
          void submit.run({
            product_id: productId.trim(),
            deal_type: proposalDealType,
            price: Number(price),
            impressions: 100_000,
            start_date: "2026-10-01",
            end_date: "2026-10-31",
          })
        }
        consequence="Not idempotent. A retry after an unclear failure may create a second proposal."
      >
        <FormFields>
          <ProductPicker value={productId} onChange={setProductId} disabled={!writesEnabled} />
          <EnumSelect
            hint="Legacy deal type the proposal is checked against; the agent rejects values it does not recognise."
            label="Deal type"
            value={proposalDealType}
            options={LEGACY_DEAL_TYPES}
            onChange={(v) => v && setProposalDealType(v)}
            disabled={!writesEnabled}
            sx={{ minWidth: 200 }}
          />
          <TipField hint="Price as a plain number in dollars, for example 10. Used as the proposal price, the counter price, and the negotiation message price (sent as USD micros, times 1,000,000)." size="small" label="Price" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!writesEnabled} />
        </FormFields>
      </WriteForm>
      <TipField hint="Id of the proposal to counter or check negotiation status for. Copy it from the Proposals screen." size="small" label="Proposal id" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
      {proposalId.trim() ? <NegotiationStatus proposalId={proposalId.trim()} /> : null}
      <WriteForm
        title="Send a legacy counter-offer?"
        confirmLabel="Counter"
        action="counter-proposal"
        blocked={!writesEnabled || !proposalId.trim()}
        pending={counter.pending}
        last={counter.last}
        onConfirm={() => void counter.run({ id: proposalId.trim(), buyer_price: Number(price) })}
        consequence="Consumes a negotiation round. A retry spends another round unless you use the idempotent messages route."
      />
      <WriteForm
        title="Post a canonical negotiation message?"
        confirmLabel="Post message"
        action="negotiation-message"
        blocked={!writesEnabled || !proposalId.trim()}
        pending={message.pending}
        last={message.last}
        onConfirm={() =>
          void message.run({
            idempotency_key: newKey(),
            action: "counter",
            proposal_id: proposalId.trim(),
            buyer_price: { amount_micros: Math.round(Number(price) * 1_000_000), currency: "USD" },
          })
        }
        consequence="Idempotent on idempotency_key per buyer. Same key + different body is 409."
      />
    </Stack>
  );
}

export function AgentWrites() {
  const { writesEnabled } = useCredential();
  const [url, setUrl] = useState("");
  const [agentId, setAgentId] = useState("");
  const [trust, setTrust] = useState("approved");
  const [notes, setNotes] = useState("");
  const discover = useMutation<{ agent_url: string }, unknown>(
    (c, a) => discoverAgent(c, a),
    { invalidates: ["agents:*"] },
  );
  const update = useMutation<{ id: string; trust_status: string; notes?: string }, unknown>(
    (c, a) => updateAgentTrust(c, a.id, { trust_status: a.trust_status, ...(a.notes ? { notes: a.notes } : {}) }),
    { invalidates: ["agents:*", `agent:${agentId}`] },
  );
  const remove = useMutation<{ id: string }, unknown>(
    (c, a) => removeRegisteredAgent(c, a.id),
    { invalidates: ["agents:*"] },
  );

  return (
    <Stack spacing={2}>
      <WriteForm
        title="Discover and register this agent?"
        confirmLabel="Discover"
        action="discover-agent"
        blocked={!writesEnabled || !url.trim()}
        pending={discover.pending}
        last={discover.last}
        onConfirm={() => void discover.run({ agent_url: url.trim() })}
        consequence="Fetches the remote card and writes a local registry row. Re-discovering the same URL updates that row."
      >
        <TipField hint="Full URL of the remote agent to look up, for example https://agent.example. Its card is fetched and stored as a local registry row." size="small" label="Agent URL" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!writesEnabled} sx={{ minWidth: 280 }} />
      </WriteForm>
      <WriteForm
        title="Change this agent's trust status?"
        confirmLabel="Update trust"
        action="update-trust"
        blocked={!writesEnabled || !agentId.trim()}
        pending={update.pending}
        last={update.last}
        onConfirm={() =>
          void update.run({ id: agentId.trim(), trust_status: trust, ...(notes ? { notes } : {}) })
        }
        consequence="Trust is this operator's decision and caps the buyer's access tier. A blocked agent is refused on later calls."
      >
        <FormFields>
          <AgentPicker value={agentId} onChange={setAgentId} disabled={!writesEnabled} />
          <TipField hint="Trust decision for the agent: unknown, registered, approved, preferred or blocked. It caps the buyer's access tier, and a blocked agent is refused on later calls." select size="small" label="Trust" value={trust} onChange={(e) => setTrust(e.target.value)} disabled={!writesEnabled} sx={{ minWidth: 160 }}>
            {["unknown", "registered", "approved", "preferred", "blocked"].map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TipField>
          <TipField hint="Optional note on why the trust status changed. Sent only when filled in." size="small" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!writesEnabled} />
        </FormFields>
      </WriteForm>
      <WriteForm
        title="Remove this agent from the local registry?"
        confirmLabel="Remove agent"
        action="remove-agent"
        blocked={!writesEnabled || !agentId.trim()}
        pending={remove.pending}
        last={remove.last}
        onConfirm={() => void remove.run({ id: agentId.trim() })}
        consequence="Deletes the local row. A second remove 404s. Remote registries are untouched."
      />
    </Stack>
  );
}

function NegotiationStatus({ proposalId }: { proposalId: string }) {
  const status = useResource(`negotiation:${proposalId}`, (c, signal) =>
    negotiationStatus(c, proposalId, signal),
  );
  const text =
    status.data?.status ??
    (status.result?.kind === "unavailable" && status.result.status === 404
      ? "no rounds yet"
      : status.result
        ? describe(status.result)
        : "");
  return <Typography variant="body2">Negotiation: {text}</Typography>;
}

export function AgentDetailLookup() {
  const [id, setId] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <Box sx={{ mt: 1 }}>
      <FormRow>
        <AgentPicker value={id} onChange={setId} />
        <ReadForm
          label="Load agent"
          action="fetch-agent"
          disabled={!id.trim()}
          onRun={() => setSubmitted(id.trim())}
        />
      </FormRow>
      {submitted && <AgentBody agentId={submitted} />}
    </Box>
  );
}

function AgentBody({ agentId }: { agentId: string }) {
  const detail = useResource(`agent:${agentId}`, (c, signal) => agentById(c, agentId, signal));
  if (!detail.data) return null;
  return (
    <Typography variant="body2" sx={{ mt: 1 }}>
      {detail.data.trust_status} · {detail.data.agent_type}
    </Typography>
  );
}

export function CuratorWrite() {
  const { writesEnabled } = useCredential();
  const [curatorId, setCuratorId] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const register = useMutation<{ curator_id: string; name: string; domain: string }, unknown>(
    (c, a) => registerCurator(c, a),
    { invalidates: ["curators"] },
  );
  return (
    <WriteForm
      title="Register this curator?"
      confirmLabel="Register curator"
      action="register-curator"
      blocked={!writesEnabled || !curatorId.trim() || !name.trim() || !domain.trim()}
      pending={register.pending}
      last={register.last}
      onConfirm={() =>
        void register.run({ curator_id: curatorId.trim(), name: name.trim(), domain: domain.trim() })
      }
      consequence="Not idempotent if the id is new; a duplicate id may 409."
    >
      <FormFields>
        <TipField hint="Your own short identifier for the curator, for example acme-curation. A duplicate id may 409." size="small" label="Curator id" value={curatorId} onChange={(e) => setCuratorId(e.target.value)} disabled={!writesEnabled} />
        <TipField hint="Display name of the curator. Required." size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!writesEnabled} />
        <TipField hint="Domain the curator operates from, for example curator.example. Required." size="small" label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={!writesEnabled} />
      </FormFields>
    </WriteForm>
  );
}

/**
 * The field a change of each type usually touches, so the form starts from
 * something the agent's severity rules and the order's metadata understand.
 * A request with no field change has nothing to apply.
 */
const CHANGE_FIELD: Readonly<Record<string, string>> = {
  creative: "creative_id",
  flight_dates: "flight_end",
  impressions: "impressions",
  pricing: "final_cpm",
  targeting: "targeting",
  cancellation: "",
  other: "",
};

/**
 * Offered, not enforced: applying a change merges `proposed_values` into the
 * order's metadata under whatever key it carries, so the agent has no field
 * list to validate against and a closed dropdown would refuse real fields.
 */
const SUGGESTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.entries(CHANGE_FIELD).map(([k, v]) => [k, v ? [v] : []])),
  flight_dates: ["flight_start", "flight_end"],
};

function problemList(result: Result<unknown> | undefined, key: string): string[] {
  if (result?.kind !== "unavailable") return [];
  const value = result.problem?.[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * With `orderId`, the order is fixed — the form is being raised from that
 * order's row, and `order` lets it say up front what the agent would refuse.
 */
export function ChangeRequestCreate({
  orderId: fixedOrder,
  order,
}: { orderId?: string; order?: { status: string; deal_id: string | null } } = {}) {
  const { writesEnabled, actorName } = useCredential();
  const [typedOrder, setOrderId] = useState("");
  // `flight_extension` was the default here once; it is not a ChangeType, so
  // every request sent with it was a 400.
  const [changeType, setChangeType] = useState<string>("flight_dates");
  const [field, setField] = useState<string | undefined>();
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const orderId = fixedOrder ?? typedOrder;
  const fieldName = (field ?? CHANGE_FIELD[changeType] ?? "").trim();
  const refusal = order ? refuseChange(order, changeType) : undefined;
  const { severity, note } = predictSeverity(changeType);

  const create = useMutation<
    {
      idempotency_key: string;
      order_id: string;
      change_type: string;
      reason?: string;
      requested_by?: string;
      diffs?: { field: string; new_value: unknown }[];
      proposed_values?: Record<string, unknown>;
    },
    ChangeRequestAck
  >((c, a) => createChangeRequest(c, a), {
    // The order's audit counts its change requests, so it goes stale too.
    invalidates: ["change-requests:*", `order-audit:${orderId.trim()}`],
  });

  const value: unknown =
    changeType === "impressions" && newValue.trim() !== "" ? Number(newValue) : newValue.trim();
  const change = fieldName && newValue.trim() ? { [fieldName]: value } : undefined;
  const created = create.last?.kind === "ok" ? create.last.data : undefined;
  const createdStatus = typeof created?.["status"] === "string" ? created["status"] : undefined;
  const refused = problemList(create.last, "validation_errors");

  return (
    <Box>
      {refusal ? (
        <Typography variant="body2" color="text.secondary" data-state="change-refused">
          {refusal}
        </Typography>
      ) : (
        <WriteForm
          title="Submit a change request?"
          confirmLabel="Create request"
          action="create-change-request"
          blocked={!writesEnabled || !orderId.trim()}
          pending={create.pending}
          last={create.last?.kind === "ok" || refused.length > 0 ? undefined : create.last}
          onConfirm={() =>
            void create.run({
              idempotency_key: newKey(),
              order_id: orderId.trim(),
              change_type: changeType,
              ...(reason ? { reason } : {}),
              ...(actorName ? { requested_by: `human:${actorName}` } : {}),
              ...(change
                ? { diffs: [{ field: fieldName, new_value: value }], proposed_values: change }
                : {}),
            })
          }
          consequence={
            <>
              Raises a <strong>{words(changeType)}</strong> change request against{" "}
              {orderId.trim()}
              {change ? (
                <>
                  , setting <strong>{fieldName}</strong> to <strong>{String(value)}</strong>
                </>
              ) : (
                <> with no field change, so applying it will write nothing</>
              )}
              . {note} Nothing on the order changes until it is applied, and applying writes into
              the order&apos;s metadata, never its status. Idempotent per order and key for 24
              hours.
            </>
          }
        >
          <FormFields>
            {fixedOrder === undefined && (
              <OrderPicker value={typedOrder} onChange={setOrderId} disabled={!writesEnabled} />
            )}
            <EnumSelect
              hint="What kind of change is being requested. It decides the usual field and how severe the agent treats the request."
              label="Change type"
              value={changeType}
              options={CHANGE_TYPES}
              onChange={(v) => {
                if (!v) return;
                setChangeType(v);
                setField(undefined);
              }}
              disabled={!writesEnabled}
              sx={{ minWidth: 180 }}
            />
            <Autocomplete
              freeSolo
              size="small"
              options={SUGGESTED_FIELDS[changeType] ?? []}
              // The field starts filled in, and the default text filter would
              // then hide every suggestion but that one.
              filterOptions={(all) => all}
              openOnFocus
              inputValue={fieldName}
              onInputChange={(_, next) => setField(next)}
              disabled={!writesEnabled}
              sx={{ minWidth: 180 }}
              renderInput={(params) => (
                <TipField
                  {...params}
                  hint="Name of the order field to change. Pick a suggestion for the change type, or type another; it starts from the usual field."
                  label="Field"
                />
              )}
            />
            <TipField
              hint="The value to set the field to. A whole number for an impressions change, otherwise text. With no value the request changes nothing when applied."
              size="small"
              label="New value"
              type={changeType === "impressions" ? "number" : "text"}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              disabled={!writesEnabled}
            />
            <TipField hint="Optional reason for the request, shown to whoever reviews it." size="small" label="Request reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!writesEnabled} />
          </FormFields>
        </WriteForm>
      )}
      {!refusal && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }} data-note="severity">
          {words(changeType)} is {severity}. {note}
        </Typography>
      )}
      {created && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="change-created">
          Created {typeof created["change_request_id"] === "string" ? created["change_request_id"] : "the request"}
          {createdStatus === "approved"
            ? ": auto-approved. Apply it from the list to write it onto the order."
            : createdStatus === "pending_approval"
              ? ": waiting for review in the list."
              : createdStatus
                ? `: ${words(createdStatus)}.`
                : "."}
        </Typography>
      )}
      {refused.length > 0 && (
        <Box sx={{ mt: 1, color: palette.error }} data-state="change-validation-failed">
          <Typography variant="body2">
            The agent refused it, and saved it as a failed request:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13 }}>
            {refused.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Review and apply for one change request. Shared by the Change requests
 * screen and the order row: a pending request reaches no approval queue and
 * has no MCP tool, so wherever an operator meets it has to be able to act.
 */
export function ChangeRequestReviewWrites({
  crId,
  status,
  changeType,
  onChanged,
  compact = false,
}: {
  crId: string;
  status: string;
  changeType?: string;
  onChanged: () => void;
  /**
   * Show only what this status allows. The Change requests screen keeps every
   * control visible and disabled, so the whole flow is legible there; in an
   * order row, beside the request's own status sentence, the one live action
   * is what matters.
   */
  compact?: boolean;
}) {
  const { writesEnabled, actorName, setActorName } = useCredential();
  const [reason, setReason] = useState("");
  const [typedName, setName] = useState<string | undefined>();
  // The stored name until the operator types a different one here.
  const name = typedName ?? actorName;
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | undefined>();
  const [pendingApply, setPendingApply] = useState(false);

  const invalidate = {
    // Apply writes into the order's metadata, so the orders read goes stale
    // too; review changes nothing on the order, but the same list shows it.
    invalidates: ["change-requests:*", `change-request:${crId}`, "orders:*", "order-audit:*"] as const,
  };

  const review = useMutation<{ id: string; body: ChangeRequestReviewInput }, unknown>(
    (c, args) => reviewChangeRequest(c, args.id, args.body),
    invalidate,
  );
  const apply = useMutation<{ id: string }, unknown>(
    (c, args) => applyChangeRequest(c, args.id),
    invalidate,
  );

  const reviewable = status === "pending_approval";
  const applicable = status === "approved";
  const busy = review.pending || apply.pending;
  const blocked = !writesEnabled;
  const outcome = review.last ?? apply.last;
  const showReview = !compact || reviewable;
  const showApply = !compact || applicable;

  return (
    <Box sx={{ mt: 1 }} data-block="change-request-controls">
      {showReview && (
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Review this request</Typography>
      )}

      <FormRow>
        {showReview && (
          <>
            <TipField
              hint="Optional reason for the decision, saved with the change request."
              size="small"
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={blocked || !reviewable || busy}
              sx={{ minWidth: 240 }}
            />
            <TipField
              hint="Name recorded as the reviewer (decided_by). It is stored as given and not verified, and is remembered for next time."
              size="small"
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void setActorName(name)}
              disabled={blocked || !reviewable || busy}
              sx={{ minWidth: 200 }}
            />
            <Hint hint="Approves this pending request so it can be applied. You are asked to confirm first.">
              <Button
                size="small"
                variant="contained"
                data-action="approve"
                disabled={blocked || !reviewable || busy}
                onClick={() => setPendingDecision("approve")}
              >
                Approve
              </Button>
            </Hint>
            <Hint hint="Rejects this pending request. The agent keeps the first decision it receives. You are asked to confirm first.">
              <Button
                size="small"
                variant="outlined"
                data-action="reject"
                disabled={blocked || !reviewable || busy}
                onClick={() => setPendingDecision("reject")}
              >
                Reject
              </Button>
            </Hint>
          </>
        )}
        {showApply && (
          <Hint hint="Writes the approved values into the order's metadata. The order's status does not change. You are asked to confirm first.">
            <Button
              size="small"
              variant={compact ? "outlined" : "text"}
              data-action="apply"
              disabled={blocked || !applicable || busy}
              onClick={() => setPendingApply(true)}
            >
              {apply.pending ? "Applying…" : "Apply to order"}
            </Button>
          </Hint>
        )}
      </FormRow>
      {/* In an order row the card already says it once; repeating it under
          every request is what made that column read as clutter. */}
      {showReview && !compact && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
          Name is stored as given; the agent does not verify it
        </Typography>
      )}

      {writesEnabled && !reviewable && !applicable && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-state="not-actionable">
          This request is {status.replace(/_/g, " ")} — only a pending-approval
          request can be reviewed, and only an approved one can be applied.
        </Typography>
      )}

      {outcome && outcome.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(outcome)}
        </Typography>
      )}

      <ConfirmAction
        open={pendingDecision !== undefined}
        title={pendingDecision === "reject" ? "Reject this change request?" : "Approve this change request?"}
        confirmLabel={pendingDecision === "reject" ? "Reject" : "Approve"}
        pending={review.pending}
        onCancel={() => setPendingDecision(undefined)}
        consequence={
          <>
            The agent records this decision on the change request. It keeps the
            first decision it receives and refuses later ones, so if this fails
            without a clear answer, re-read the request before trying again
            rather than reviewing twice.
          </>
        }
        onConfirm={() => {
          const decision = pendingDecision;
          setPendingDecision(undefined);
          if (!decision) return;
          void review
            .run({
              id: crId,
              body: {
                decision,
                ...(reason ? { reason } : {}),
                ...(name.trim() ? { decided_by: name.trim() } : {}),
              },
            })
            .then(onChanged);
        }}
      />

      <ConfirmAction
        open={pendingApply}
        title="Apply this change request to the order?"
        confirmLabel="Apply"
        pending={apply.pending}
        onCancel={() => setPendingApply(false)}
        consequence={
          <>
            The agent writes the proposed values into the order&apos;s metadata and
            marks this request applied. The order&apos;s status does not change
            {changeType === "cancellation"
              ? " — applying a cancellation request does not cancel the order; that is a separate transition"
              : ""}
            . A second apply is refused, so if this fails without a clear answer,
            re-read the request rather than applying twice.
          </>
        }
        onConfirm={() => {
          setPendingApply(false);
          void apply.run({ id: crId }).then(onChanged);
        }}
      />
    </Box>
  );
}

export function EventLookup({ eventId }: { eventId: string }) {
  const detail = useResource(`event:${eventId}`, (c, signal) => eventById(c, eventId, signal));
  if (!detail.data && !detail.result) return null;
  return (
    <Box data-block="event-by-id" sx={{ mt: 1 }}>
      <ReadOutcome name="Event" data={detail.data} result={detail.result} />
    </Box>
  );
}

export function ApiKeyDetailLookup() {
  const [id, setId] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <Box sx={{ mt: 1 }}>
      <FormRow>
        <TipField hint="Id of the API key to look up, as shown in the API keys list. Metadata only; the secret is never returned." size="small" label="Key id" value={id} onChange={(e) => setId(e.target.value)} />
        <ReadForm
          label="Load key"
          action="fetch-key"
          disabled={!id.trim()}
          onRun={() => setSubmitted(id.trim())}
        />
      </FormRow>
      {submitted && <ApiKeyBody keyId={submitted} />}
    </Box>
  );
}

function ApiKeyBody({ keyId }: { keyId: string }) {
  const detail = useResource(`api-key:${keyId}`, (c, signal) => apiKeyById(c, keyId, signal));
  if (!detail.data) return null;
  return (
    <Typography variant="body2" sx={{ mt: 1, fontFamily: "monospace", fontSize: 12 }}>
      {detail.data.key_id} · {detail.data.role} · revoked {String(detail.data.revoked)}
    </Typography>
  );
}

export function AudienceMatchForm() {
  const [identifier, setIdentifier] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }} data-block="audience-match">
      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Audience match
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        A POST that stores nothing, so it runs with writes off.
      </Typography>
      <FormRow>
        <TipField
          hint="Identifier of the audience to score. Sent as an agentic audience reference; required."
          size="small"
          label="Audience identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <ReadForm
          label="Match"
          action="audience-match"
          disabled={!identifier.trim()}
          onRun={() => setSubmitted(identifier.trim())}
        />
      </FormRow>
      {submitted && <AudienceMatchBody identifier={submitted} />}
    </Paper>
  );
}

function AudienceMatchBody({ identifier }: { identifier: string }) {
  const match = useResource(`audience:${identifier}`, (c, signal) =>
    audienceMatch(c, { audience_ref: { type: "agentic", identifier } }, signal),
  );
  return (
    <Typography variant="body2" sx={{ mt: 1 }}>
      {match.data
        ? `${match.data.match_quality} (${match.data.match_confidence})`
        : match.result
          ? describe(match.result)
          : ""}
    </Typography>
  );
}

// --- OpenProposal lifecycle (ADR 14) -----------------------------------------

/**
 * One idempotency key per attempt, kept across a retry whose outcome is
 * unknown. The other call sites mint a key per run, which is right when every
 * failure is a definite answer; here a timeout on publish or assent may have
 * landed, and retrying with a fresh key would ask the agent to do it twice.
 * Any definite answer — success, 409, 422 — ends the attempt.
 */
function useAttemptKey(): { key: string; settle: (result: Result<unknown>) => void } {
  const [key, setKey] = useState(newKey);
  return {
    key,
    settle: (result) => {
      // Nothing was sent (writes-disabled, busy) or nobody knows (timeout,
      // network, an unparseable body): keep the key.
      const definite =
        result.kind !== "unavailable" || result.reason === "http";
      if (definite) setKey(newKey());
    },
  };
}

/** A 409 here means the record moved under the operator, not that the agent failed. */
function StaleNote({ last }: { last: Result<unknown> | undefined }) {
  if (last?.kind !== "unavailable" || last.reason !== "http" || last.status !== 409) return null;
  return (
    <Typography variant="body2" sx={{ mt: 0.5, color: palette.warningText }} data-state="stale-version">
      The proposal changed since this screen loaded it, so nothing was applied. Review
      the current version before trying again.
    </Typography>
  );
}

function proposalInvalidations(proposalId: string): string[] {
  return [`open-proposal:${proposalId}`, "open-proposals:*"];
}

export function ProposalLifecycleWrites({ proposal }: { proposal: Proposal }) {
  const { writesEnabled } = useCredential();
  const id = proposal.proposal_id;
  const version = proposal.version;
  const status = proposal.status ?? "";
  const [reason, setReason] = useState("");
  const attempt = useAttemptKey();

  type Guard = { idempotency_key: string; expected_version: number | null };
  const publish = useMutation<Guard, unknown>((c, a) => publishProposal(c, id, a), {
    invalidates: proposalInvalidations(id),
  });
  const withdraw = useMutation<Guard & { reason?: string }, unknown>(
    (c, a) => withdrawProposal(c, id, a),
    { invalidates: proposalInvalidations(id) },
  );
  const assent = useMutation<Guard & { decision: "accept" | "decline"; reason?: string }, unknown>(
    (c, a) => assentProposal(c, id, a),
    { invalidates: proposalInvalidations(id) },
  );

  const run = <A extends object>(m: { run: (a: A & Guard) => Promise<Result<unknown>> }, args: A) =>
    void m
      .run({ ...args, idempotency_key: attempt.key, expected_version: version })
      .then(attempt.settle);

  const blocked = !writesEnabled;
  const lastAsk = [...proposal.negotiation_history].reverse().find((e) => e.actor === "buyer");
  const withReason = reason.trim() ? { reason: reason.trim() } : {};

  const canPublish = status === "draft";
  const canWithdraw = status === "published" || status === "under_review";
  const canAssent = status === "under_review";

  if (!canPublish && !canWithdraw && !canAssent) {
    return (
      <Typography variant="body2" color="text.secondary" data-state="no-lifecycle-action">
        No lifecycle action applies to a proposal that is {status ? status.replace(/_/g, " ") : "of unreported status"}.
      </Typography>
    );
  }

  return (
    <Stack spacing={2} data-block="proposal-lifecycle">
      {canPublish && (
        <Box>
          <WriteForm
            title="Publish this proposal?"
            confirmLabel="Publish"
            action="publish-proposal"
            blocked={blocked}
            pending={publish.pending}
            last={publish.last}
            onConfirm={() => run(publish, {})}
            consequence={`Buyer agents can discover version ${version ?? "?"} from this point. Seller-set fields stay revisable while it is published. Replay-safe: a retry after a timeout reuses the same idempotency key.`}
          />
          <StaleNote last={publish.last} />
        </Box>
      )}
      {canAssent && (
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }} data-block="assent-ask">
            Under review: the buyer&apos;s last move was{" "}
            {lastAsk ? `${lastAsk.action ?? "unreported"} on version ${lastAsk.version ?? "?"}` : "not recorded"}
            {lastAsk && lastAsk.fields_changed.length > 0 && `, changing ${lastAsk.fields_changed.join(", ")}`}.
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <WriteForm
              title="Accept this version and make it binding?"
              confirmLabel="Accept"
              action="assent-accept"
              blocked={blocked}
              pending={assent.pending}
              last={assent.last}
              onConfirm={() => run(assent, { decision: "accept" as const, ...withReason })}
              consequence={`Your assent makes version ${version ?? "?"} binding: the proposal becomes agreed, held line items convert, and the stored record is frozen with every catalog reference resolved. This is the commercial commitment, and there is no undo from this console.`}
            />
            <WriteForm
              title="Decline the version under review?"
              confirmLabel="Decline"
              action="assent-decline"
              blocked={blocked}
              pending={assent.pending}
              last={assent.last}
              onConfirm={() => run(assent, { decision: "decline" as const, ...withReason })}
              consequence="Records a seller decline in the negotiation history, which is append-only. The buyer may propose again."
            />
          </Stack>
          <StaleNote last={assent.last} />
        </Box>
      )}
      {canWithdraw && (
        <Box>
          <WriteForm
            title="Withdraw this proposal?"
            confirmLabel="Withdraw"
            action="withdraw-proposal"
            blocked={blocked}
            pending={withdraw.pending}
            last={withdraw.last}
            onConfirm={() => run(withdraw, withReason)}
            consequence="Withdrawn is terminal. Buyer agents composing against it lose it, including any line items they were about to commit."
          />
          <StaleNote last={withdraw.last} />
        </Box>
      )}
      {(canWithdraw || canAssent) && (
        <TipField
          hint="Optional reason sent with a withdraw or an assent (accept or decline). Not used for publish."
          size="small"
          label="Reason (optional, sent with withdraw or assent)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={blocked}
          sx={{ maxWidth: 480 }}
        />
      )}
    </Stack>
  );
}

export function LineItemHoldWrites({ proposal, item }: { proposal: Proposal; item: LineItem }) {
  const { writesEnabled } = useCredential();
  const attempt = useAttemptKey();
  const state = item.hold_status?.state ?? "none";
  const hold = useMutation<
    { action: "grant" | "release"; idempotency_key: string; expected_version: number | null },
    unknown
  >((c, a) => holdLineItem(c, proposal.proposal_id, item.line_item_id, a), {
    invalidates: proposalInvalidations(proposal.proposal_id),
  });
  const run = (action: "grant" | "release") =>
    void hold
      .run({ action, idempotency_key: attempt.key, expected_version: proposal.version })
      .then(attempt.settle);

  if (state !== "requested" && state !== "held") return null;

  return (
    <Box data-block={`hold-writes:${item.line_item_id}`}>
      {state === "requested" ? (
        <WriteForm
          title="Grant the requested hold?"
          confirmLabel="Grant hold"
          action="grant-hold"
          blocked={!writesEnabled}
          pending={hold.pending}
          last={hold.last}
          onConfirm={() => run("grant")}
          consequence={`Reserves this inventory for ${item.hold_status?.hold_duration ?? "an unreported duration"}, scoped to the ${item.hold_status?.hold_scope ?? "unreported scope"}. Nobody else can commit it until the hold expires, is released, or converts on agreement.`}
        />
      ) : (
        <WriteForm
          title="Release this hold?"
          confirmLabel="Release hold"
          action="release-hold"
          blocked={!writesEnabled}
          pending={hold.pending}
          last={hold.last}
          onConfirm={() => run("release")}
          consequence="The inventory returns to the shelf now, before the hold would have expired. The buyer loses its reservation."
        />
      )}
      <StaleNote last={hold.last} />
    </Box>
  );
}

export { Panel };
