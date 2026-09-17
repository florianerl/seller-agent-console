import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  agentById,
  apiKeyById,
  assemblePackage,
  audienceMatch,
  bookDeal,
  bulkDealOperations,
  closeSession,
  counterProposal,
  createBuyerApiKey,
  createChangeRequest,
  createCuratedDeal,
  createOperatorApiKey,
  createOrder,
  createPackage,
  createQuote,
  createSession,
  dealBuyerStatus,
  dealById,
  dealFromTemplate,
  dealsExport,
  dealSspTroubleshoot,
  deleteInventoryTypeOverride,
  deletePackage,
  deprecateDeal,
  discoverAgent,
  distributeDeal,
  eventById,
  generateDeal,
  migrateDeal,
  negotiationStatus,
  orderById,
  orderHistory,
  packageById,
  postNegotiationMessage,
  pushDeal,
  putRateCard,
  quoteById,
  registerCurator,
  removeRegisteredAgent,
  revokeApiKey,
  sendSessionMessage,
  setInventoryTypeOverride,
  submitProposal,
  syncPackages,
  transitionOrder,
  triggerInventorySync,
  updateAgentTrust,
  updatePackage,
  type CreatedApiKey,
} from "../api/endpoints";
import { describe } from "../api/errors";
import { WriteForm } from "../components/WriteForm";
import { WritesNotice } from "../components/WritesNotice";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { stamp } from "../lib/time";
import { palette } from "../theme/palette";

function newKey(): string {
  return crypto.randomUUID();
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }} data-block="operator-writes">
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
      <TextField
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
      </TextField>
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
        <TextField
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
        <TextField
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
  const [inventoryType, setInventoryType] = useState("display");
  const [reason, setReason] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [pkgPrice, setPkgPrice] = useState("10");
  const [pkgFloor, setPkgFloor] = useState("5");
  const [pkgId, setPkgId] = useState("");
  const [productIds, setProductIds] = useState("");
  const [cpm, setCpm] = useState("12");
  const [rateType, setRateType] = useState("display");

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
    { invalidates: [`inventory-override:${productId}`] },
  );
  const clearOverride = useMutation<{ productId: string }, unknown>(
    (c, args) => deleteInventoryTypeOverride(c, args.productId),
    { invalidates: [`inventory-override:${productId}`] },
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
    { invalidates: ["packages", `package:${pkgId}`] },
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
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Inventory type"
            value={rateType}
            onChange={(e) => setRateType(e.target.value)}
            disabled={blocked}
          />
          <TextField
            size="small"
            label="Base CPM"
            value={cpm}
            onChange={(e) => setCpm(e.target.value)}
            disabled={blocked}
          />
        </Stack>
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
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Product id"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={blocked}
          />
          <TextField
            size="small"
            label="Inventory type"
            value={inventoryType}
            onChange={(e) => setInventoryType(e.target.value)}
            disabled={blocked}
          />
          <TextField
            size="small"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={blocked}
          />
        </Stack>
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
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField size="small" label="Name" value={pkgName} onChange={(e) => setPkgName(e.target.value)} disabled={blocked} />
          <TextField size="small" label="Base price" value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} disabled={blocked} />
          <TextField size="small" label="Floor" value={pkgFloor} onChange={(e) => setPkgFloor(e.target.value)} disabled={blocked} />
        </Stack>
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
        <TextField size="small" label="Package id" value={pkgId} onChange={(e) => setPkgId(e.target.value)} disabled={blocked} />
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
        <TextField
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

export function QuoteLookup() {
  const [id, setId] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }} data-block="quote-lookup">
      <WritesNotice what="Fetching a quote enforces its TTL and may persist status=expired." />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Quote id" value={id} onChange={(e) => setId(e.target.value)} />
        <WriteForm
          title="Re-read this quote?"
          confirmLabel="Fetch quote"
          action="fetch-quote"
          blocked={!id.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(id.trim())}
          consequence="This GET can expire the stored quote. Re-reading an already-expired quote is a no-op besides the 410."
        />
      </Stack>
      {submitted && <QuoteBody quoteId={submitted} />}
    </Paper>
  );
}

function QuoteBody({ quoteId }: { quoteId: string }) {
  const quote = useResource(`quote:${quoteId}`, (c, signal) => quoteById(c, quoteId, signal));
  return (
    <Box component="pre" sx={{ mt: 1, fontSize: 12, overflow: "auto" }}>
      {quote.data ? JSON.stringify(quote.data, null, 2) : quote.result ? describe(quote.result) : ""}
    </Box>
  );
}

export function CreateQuoteWrite() {
  const { writesEnabled } = useCredential();
  const [productId, setProductId] = useState("");
  const create = useMutation<{ product_id: string; idempotency_key: string }, unknown>(
    (c, args) => createQuote(c, { ...args, media_type: "display" }),
  );

  return (
    <WriteForm
      title="Request a quote?"
      confirmLabel="Create quote"
      action="create-quote"
      blocked={!writesEnabled || !productId.trim()}
      pending={create.pending}
      last={create.last}
      onConfirm={() =>
        void create.run({ product_id: productId.trim(), idempotency_key: newKey() })
      }
      consequence={
        <>
          Quotes are ephemeral (24h TTL) and non-binding. The same idempotency
          key with the same body returns the original quote; a different body
          with that key 409s.
        </>
      }
    >
      <TextField
        size="small"
        label="Product id"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        disabled={!writesEnabled}
      />
    </WriteForm>
  );
}

export function PackageLookup() {
  const [id, setId] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <Box sx={{ mt: 1 }} data-block="package-lookup">
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="Package id" value={id} onChange={(e) => setId(e.target.value)} />
        <WriteForm
          title="Load this package?"
          confirmLabel="Load package"
          action="fetch-package"
          blocked={!id.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(id.trim())}
          consequence="A GET. An invalid key is rejected rather than treated as anonymous."
        />
      </Stack>
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

export function OrderWrites({ orderId }: { orderId?: string }) {
  const { writesEnabled } = useCredential();
  const [dealId, setDealId] = useState("");
  const [target, setTarget] = useState(orderId ?? "");
  const [toStatus, setToStatus] = useState("submitted");
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");

  const create = useMutation<{ deal_id: string }, unknown>(
    (c, args) => createOrder(c, args),
    { invalidates: ["orders:*"] },
  );
  const transition = useMutation<{ id: string; to_status: string; actor?: string; reason?: string }, unknown>(
    (c, args) =>
      transitionOrder(c, args.id, {
        to_status: args.to_status,
        ...(args.actor ? { actor: args.actor } : {}),
        ...(args.reason ? { reason: args.reason } : {}),
      }),
    { invalidates: ["orders:*", `order-audit:${target}`] },
  );

  return (
    <Stack spacing={2}>
      <WriteForm
        title="Create a draft order?"
        confirmLabel="Create order"
        action="create-order"
        blocked={!writesEnabled}
        pending={create.pending}
        last={create.last}
        onConfirm={() => void create.run({ deal_id: dealId.trim() })}
        consequence="Not idempotent: each call mints a new order id. A failure leaves a draft or does not."
      >
        <TextField
          size="small"
          label="Deal id (optional)"
          value={dealId}
          onChange={(e) => setDealId(e.target.value)}
          disabled={!writesEnabled}
        />
      </WriteForm>
      <WriteForm
        title="Transition this order?"
        confirmLabel="Transition"
        action="transition-order"
        blocked={!writesEnabled || !target.trim()}
        pending={transition.pending}
        last={transition.last}
        onConfirm={() =>
          void transition.run({
            id: target.trim(),
            to_status: toStatus,
            ...(actor ? { actor } : {}),
            ...(reason ? { reason } : {}),
          })
        }
        consequence="Not idempotent. A 409 names the allowed next states. Re-read the order before retrying."
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField size="small" label="Order id" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!writesEnabled} />
          <TextField size="small" label="To status" value={toStatus} onChange={(e) => setToStatus(e.target.value)} disabled={!writesEnabled} />
          <TextField size="small" label="Actor" value={actor} onChange={(e) => setActor(e.target.value)} disabled={!writesEnabled} />
          <TextField size="small" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!writesEnabled} />
        </Stack>
      </WriteForm>
    </Stack>
  );
}

export function OrderRecord({ orderId }: { orderId: string }) {
  const order = useResource(`order:${orderId}`, (c, signal) => orderById(c, orderId, signal));
  const history = useResource(`order-history:${orderId}`, (c, signal) =>
    orderHistory(c, orderId, signal),
  );
  return (
    <Box data-block="order-record">
      <Typography variant="body2">
        Current: {order.data?.status ?? (order.result ? describe(order.result) : "…")}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        History entries: {history.data?.transitions.length ?? "—"}
        {history.asOf !== undefined ? ` · as of ${stamp(new Date(history.asOf).toISOString())}` : ""}
      </Typography>
    </Box>
  );
}

export function DealWrites({ dealId }: { dealId?: string }) {
  const { writesEnabled } = useCredential();
  const [proposalId, setProposalId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [id, setId] = useState(dealId ?? "");
  const [buyerUrl, setBuyerUrl] = useState("https://buyer.example");
  const [ssp, setSsp] = useState("");
  const [curatorId, setCuratorId] = useState("");
  const [reason, setReason] = useState("");
  const [productId, setProductId] = useState("");
  const [dealType, setDealType] = useState("preferred_deal");

  const gen = useMutation<{ proposal_id: string }, unknown>((c, a) => generateDeal(c, a), {
    invalidates: ["deals:*"],
  });
  const book = useMutation<{ quote_id: string; idempotency_key: string }, unknown>(
    (c, a) => bookDeal(c, a),
    { invalidates: ["deals:*"] },
  );
  const fromTpl = useMutation<{ deal_type: string; product_id: string }, unknown>(
    (c, a) => dealFromTemplate(c, a),
    { invalidates: ["deals:*"] },
  );
  const bulk = useMutation<{ operations: { action: string; deal_id?: string }[] }, unknown>(
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
  const curated = useMutation<{ curator_id: string }, unknown>(
    (c, a) => createCuratedDeal(c, a),
    { invalidates: ["deals:*"] },
  );
  const migrate = useMutation<{ id: string; reason?: string }, unknown>(
    (c, a) => migrateDeal(c, a.id, { ...(a.reason ? { reason: a.reason } : {}) }),
    { invalidates: ["deals:*", `deal-lineage:${id}`] },
  );
  const deprecate = useMutation<{ id: string; reason: string }, unknown>(
    (c, a) => deprecateDeal(c, a.id, { reason: a.reason }),
    { invalidates: ["deals:*"] },
  );

  const blocked = !writesEnabled;

  return (
    <Stack spacing={2}>
      <WriteForm
        title="Generate a deal from a proposal?"
        confirmLabel="Generate deal"
        action="generate-deal"
        blocked={blocked || !proposalId.trim()}
        pending={gen.pending}
        last={gen.last}
        onConfirm={() => void gen.run({ proposal_id: proposalId.trim() })}
        consequence="POST /deals from an accepted proposal. Not the same route as booking a quote. Not idempotent."
      >
        <TextField size="small" label="Proposal id" value={proposalId} onChange={(e) => setProposalId(e.target.value)} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Book a deal from a quote?"
        confirmLabel="Book deal"
        action="book-deal"
        blocked={blocked || !quoteId.trim()}
        pending={book.pending}
        last={book.last}
        onConfirm={() =>
          void book.run({ quote_id: quoteId.trim(), idempotency_key: newKey() })
        }
        consequence="The commit point: the quote becomes bound. Same idempotency key + body returns the same deal; a different body 409s."
      >
        <TextField size="small" label="Quote id" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Create a deal from a template?"
        confirmLabel="From template"
        action="deal-from-template"
        blocked={blocked || !productId.trim()}
        pending={fromTpl.pending}
        last={fromTpl.last}
        onConfirm={() => void fromTpl.run({ deal_type: dealType, product_id: productId.trim() })}
        consequence="Prices and auto-books. 422 if max CPM is below floor. Not a replay-safe mint without an idempotency story on this route."
      >
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="Product id" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={blocked} />
          <TextField size="small" label="Deal type" value={dealType} onChange={(e) => setDealType(e.target.value)} disabled={blocked} />
        </Stack>
      </WriteForm>
      <WriteForm
        title="Run a bulk deal operation?"
        confirmLabel="Bulk pause"
        action="bulk-deals"
        blocked={blocked || !id.trim()}
        pending={bulk.pending}
        last={bulk.last}
        onConfirm={() =>
          void bulk.run({ operations: [{ action: "pause", deal_id: id.trim() }] })
        }
        consequence="Partial success is possible: some operations may land while others fail. Re-read the list rather than repeating the batch blindly."
      >
        <TextField size="small" label="Deal id" value={id} onChange={(e) => setId(e.target.value)} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Push this deal to a buyer?"
        confirmLabel="Push"
        action="push-deal"
        blocked={blocked || !id.trim()}
        pending={push.pending}
        last={push.last}
        onConfirm={() => void push.run({ deal_id: id.trim(), buyer_urls: [buyerUrl] })}
        consequence="Notifies the named buyer URLs. A retry may notify twice."
      >
        <TextField size="small" label="Buyer URL" value={buyerUrl} onChange={(e) => setBuyerUrl(e.target.value)} disabled={blocked} sx={{ minWidth: 240 }} />
      </WriteForm>
      <WriteForm
        title="Distribute this deal to an SSP?"
        confirmLabel="Distribute"
        action="distribute-deal"
        blocked={blocked || !id.trim()}
        pending={dist.pending}
        last={dist.last}
        onConfirm={() =>
          void dist.run({ deal_id: id.trim(), ...(ssp ? { ssp_name: ssp } : {}) })
        }
        consequence="A retry may push a second copy to the SSP."
      >
        <TextField size="small" label="SSP name" value={ssp} onChange={(e) => setSsp(e.target.value)} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Create a curated deal?"
        confirmLabel="Curated deal"
        action="curated-deal"
        blocked={blocked || !curatorId.trim()}
        pending={curated.pending}
        last={curated.last}
        onConfirm={() => void curated.run({ curator_id: curatorId.trim() })}
        consequence="Not idempotent: each call mints another curated deal."
      >
        <TextField size="small" label="Curator id" value={curatorId} onChange={(e) => setCuratorId(e.target.value)} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Migrate this deal?"
        confirmLabel="Migrate"
        action="migrate-deal"
        blocked={blocked || !id.trim()}
        pending={migrate.pending}
        last={migrate.last}
        onConfirm={() => void migrate.run({ id: id.trim(), ...(reason ? { reason } : {}) })}
        consequence="Mints a successor and records lineage. A retry may mint a second successor."
      >
        <TextField size="small" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={blocked} />
      </WriteForm>
      <WriteForm
        title="Deprecate this deal?"
        confirmLabel="Deprecate"
        action="deprecate-deal"
        blocked={blocked || !id.trim() || !reason.trim()}
        pending={deprecate.pending}
        last={deprecate.last}
        onConfirm={() => void deprecate.run({ id: id.trim(), reason: reason.trim() })}
        consequence="Marks the deal deprecated. A second deprecate may 409 depending on status."
      />
    </Stack>
  );
}

export function DealLookups({ dealId }: { dealId: string }) {
  const [loadRecord, setLoadRecord] = useState(false);
  const [loadExport, setLoadExport] = useState(false);

  return (
    <Stack spacing={1} data-block="deal-lookups">
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
      <BuyerStatus dealId={dealId} />
      <SspTrouble dealId={dealId} />
      <WriteForm
        title="Export every stored deal?"
        confirmLabel="Export deals"
        action="export-deals"
        blocked={false}
        pending={false}
        last={undefined}
        onConfirm={() => setLoadExport(true)}
        consequence="An unpaginated scan of stored records. Not a write, but heavy."
      />
      {loadExport && <DealsExportBody />}
    </Stack>
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
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="Buyer URL" value={buyerUrl} onChange={(e) => setBuyerUrl(e.target.value)} />
        <WriteForm
          title="Read buyer activation status?"
          confirmLabel="Buyer status"
          action="deal-buyer-status"
          blocked={!buyerUrl.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(buyerUrl.trim())}
          consequence="A GET of how this buyer sees the deal."
        />
      </Stack>
      {submitted && <BuyerStatusBody dealId={dealId} buyerUrl={submitted} />}
    </>
  );
}

function BuyerStatusBody({ dealId, buyerUrl }: { dealId: string; buyerUrl: string }) {
  const buyer = useResource(`deal-buyer:${dealId}:${buyerUrl}`, (c, signal) =>
    dealBuyerStatus(c, dealId, buyerUrl, signal),
  );
  return (
    <Typography variant="caption">
      Buyer status: {buyer.data ? JSON.stringify(buyer.data) : buyer.result ? describe(buyer.result) : ""}
    </Typography>
  );
}

function SspTrouble({ dealId }: { dealId: string }) {
  const [ssp, setSsp] = useState("gam");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <>
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="SSP" value={ssp} onChange={(e) => setSsp(e.target.value)} />
        <WriteForm
          title="Troubleshoot this SSP?"
          confirmLabel="Troubleshoot"
          action="deal-ssp"
          blocked={!ssp.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(ssp.trim())}
          consequence="A GET of connector diagnostics for one SSP."
        />
      </Stack>
      {submitted && <SspTroubleBody dealId={dealId} ssp={submitted} />}
    </>
  );
}

function SspTroubleBody({ dealId, ssp }: { dealId: string; ssp: string }) {
  const trouble = useResource(`deal-ssp:${dealId}:${ssp}`, (c, signal) =>
    dealSspTroubleshoot(c, dealId, ssp, signal),
  );
  return (
    <Typography variant="caption">
      SSP troubleshoot: {trouble.data ? JSON.stringify(trouble.data) : trouble.result ? describe(trouble.result) : ""}
    </Typography>
  );
}

function DealsExportBody() {
  const exported = useResource("deals-export", (c, signal) => dealsExport(c, {}, signal));
  return (
    <Typography variant="caption">
      Export: {exported.data ? JSON.stringify(exported.data).slice(0, 200) : exported.result ? describe(exported.result) : ""}
    </Typography>
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
        <TextField
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
            deal_type: "preferred_deal",
            price: Number(price),
            impressions: 100_000,
            start_date: "2026-10-01",
            end_date: "2026-10-31",
          })
        }
        consequence="Not idempotent. A retry after an unclear failure may create a second proposal."
      >
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="Product id" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!writesEnabled} />
          <TextField size="small" label="Price" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!writesEnabled} />
        </Stack>
      </WriteForm>
      <TextField size="small" label="Proposal id" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
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
        <TextField size="small" label="Agent URL" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!writesEnabled} sx={{ minWidth: 280 }} />
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
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField size="small" label="Agent id" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={!writesEnabled} />
          <TextField select size="small" label="Trust" value={trust} onChange={(e) => setTrust(e.target.value)} disabled={!writesEnabled} sx={{ minWidth: 160 }}>
            {["unknown", "registered", "approved", "preferred", "blocked"].map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!writesEnabled} />
        </Stack>
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
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="Agent id" value={id} onChange={(e) => setId(e.target.value)} />
        <WriteForm
          title="Load this registered agent?"
          confirmLabel="Load agent"
          action="fetch-agent"
          blocked={!id.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(id.trim())}
          consequence="A GET of the local registry row."
        />
      </Stack>
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
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Curator id" value={curatorId} onChange={(e) => setCuratorId(e.target.value)} disabled={!writesEnabled} />
        <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!writesEnabled} />
        <TextField size="small" label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={!writesEnabled} />
      </Stack>
    </WriteForm>
  );
}

export function ChangeRequestCreate() {
  const { writesEnabled } = useCredential();
  const [orderId, setOrderId] = useState("");
  const [changeType, setChangeType] = useState("flight_extension");
  const [reason, setReason] = useState("");
  const create = useMutation<
    { idempotency_key: string; order_id: string; change_type: string; reason?: string },
    unknown
  >((c, a) => createChangeRequest(c, a), { invalidates: ["change-requests:*"] });

  return (
    <WriteForm
      title="Submit a change request?"
      confirmLabel="Create request"
      action="create-change-request"
      blocked={!writesEnabled || !orderId.trim()}
      pending={create.pending}
      last={create.last}
      onConfirm={() =>
        void create.run({
          idempotency_key: newKey(),
          order_id: orderId.trim(),
          change_type: changeType,
          ...(reason ? { reason } : {}),
        })
      }
      consequence="Idempotent per order and key for 24 hours. Same key + different body is 409."
    >
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Order id" value={orderId} onChange={(e) => setOrderId(e.target.value)} disabled={!writesEnabled} />
        <TextField size="small" label="Change type" value={changeType} onChange={(e) => setChangeType(e.target.value)} disabled={!writesEnabled} />
        <TextField size="small" label="Request reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!writesEnabled} />
      </Stack>
    </WriteForm>
  );
}

export function EventLookup({ eventId }: { eventId: string }) {
  const detail = useResource(`event:${eventId}`, (c, signal) => eventById(c, eventId, signal));
  if (!detail.data && !detail.result) return null;
  return (
    <Box
      component="pre"
      data-block="event-by-id"
      sx={{ mt: 1, p: 1.5, fontSize: 12, overflow: "auto", maxHeight: 240, backgroundColor: palette.ground }}
    >
      {detail.data ? JSON.stringify(detail.data, null, 2) : detail.result ? describe(detail.result) : ""}
    </Box>
  );
}

export function ApiKeyDetailLookup() {
  const [id, setId] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="Key id" value={id} onChange={(e) => setId(e.target.value)} />
        <WriteForm
          title="Load this key's metadata?"
          confirmLabel="Load key"
          action="fetch-key"
          blocked={!id.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(id.trim())}
          consequence="Metadata only. The secret is never on this route."
        />
      </Stack>
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
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          label="Audience identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <WriteForm
          title="Score this audience?"
          confirmLabel="Match"
          action="audience-match"
          blocked={!identifier.trim()}
          pending={false}
          last={undefined}
          onConfirm={() => setSubmitted(identifier.trim())}
          consequence="Query-shaped: nothing is stored. A missing identifier is a form error, not an outage."
        />
      </Stack>
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

export { Panel };
