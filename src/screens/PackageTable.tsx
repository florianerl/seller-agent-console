import { useState } from "react";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
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
  assemblePackage,
  createPackage,
  deletePackage,
  packages,
  syncPackages,
  updatePackage,
  type Package,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { ConfirmButton, WRITES_OFF_HINT } from "../components/ConfirmButton";
import { DataPanel } from "../components/DataPanel";
import { Hint } from "../components/Hint";
import { TipField } from "../components/TipField";
import { useCredential } from "../credentials/context";
import { plain, priceProblem } from "../lib/money";
import { CADENCE } from "../query/cadence";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { PACKAGE_VIEWS } from "./package-draft";
import { ProductMultiPicker } from "./pickers";

/** Which row is open: a package id, or one of the two new-package rows. */
type Editing = { kind: "edit"; id: string } | { kind: "create" } | { kind: "assemble" };

type Draft = { name: string; featured: boolean; base: string; floor: string; productIds: string[] };

const EMPTY: Draft = { name: "", featured: false, base: "", floor: "", productIds: [] };

const cellSx = { fontSize: 12 } as const;

/**
 * Only the fields the operator changed go on the wire. The PUT is a partial
 * update on the agent's side, so an untouched field keeps whatever it holds —
 * including fields this table does not show.
 *
 * Base price is never prefilled. The Price column is this key's price, with
 * its tier discount applied, not the stored base; prefilling the field with it
 * and saving would quietly cut the base by the discount.
 */
function changes(pkg: Package, draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (draft.name.trim() && draft.name.trim() !== pkg.name) out.name = draft.name.trim();
  if (draft.featured !== pkg.is_featured) out.is_featured = draft.featured;
  if (draft.floor.trim() !== "" && Number(draft.floor) !== pkg.floor_price) {
    out.floor_price = Number(draft.floor);
  }
  if (draft.base.trim() !== "") out.base_price = Number(draft.base);
  return out;
}

function Failure({ last }: { last: Result<unknown> | undefined }) {
  if (!last || last.kind === "ok") return null;
  return (
    <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
      {describe(last)}
    </Typography>
  );
}

export function PackageTable() {
  const { writesEnabled } = useCredential();
  const list = useResource("packages", packages, { refreshInterval: CADENCE.rateCard });
  const [editing, setEditing] = useState<Editing | undefined>();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const update = useMutation<{ id: string; body: Record<string, unknown> }, unknown>(
    (c, args) => updatePackage(c, args.id, args.body),
    { invalidates: (args) => [...PACKAGE_VIEWS, `package:${args.id}`] },
  );
  const archive = useMutation<{ id: string }, unknown>(
    (c, args) => deletePackage(c, args.id),
    { invalidates: (args) => [...PACKAGE_VIEWS, `package:${args.id}`] },
  );
  const create = useMutation<{ name: string; base_price: number; floor_price: number }, unknown>(
    (c, args) => createPackage(c, args),
    { invalidates: PACKAGE_VIEWS },
  );
  const assemble = useMutation<{ name: string; product_ids: string[] }, unknown>(
    (c, args) => assemblePackage(c, args),
    { invalidates: PACKAGE_VIEWS },
  );
  const sync = useMutation<Record<string, never>, unknown>((c) => syncPackages(c), {
    invalidates: PACKAGE_VIEWS,
  });

  const blocked = !writesEnabled;
  const rows = list.data?.packages ?? [];
  const busy = update.pending || create.pending || assemble.pending || archive.pending;

  // Only the last attempt's outcome is worth showing; an old failure under a
  // new edit would read as the new one failing.
  function open(next: Editing, initial: Draft = EMPTY) {
    for (const m of [update, archive, create, assemble, sync]) m.reset();
    setEditing(next);
    setDraft(initial);
  }

  async function settle(result: Promise<Result<unknown>>) {
    if ((await result).kind === "ok") setEditing(undefined);
  }

  const cancel = (
    <Button size="small" onClick={() => setEditing(undefined)} disabled={busy}>
      Cancel
    </Button>
  );

  const nameField = (
    <TipField
      hint="The package name buyers see."
      size="small"
      value={draft.name}
      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      placeholder="Name"
      slotProps={{ htmlInput: { "aria-label": "Name" } }}
      sx={{ minWidth: 200 }}
    />
  );
  const priceField = (label: string, key: "base" | "floor", hint: string, placeholder = label) => (
    <TipField
      hint={hint}
      size="small"
      placeholder={placeholder}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      slotProps={{ htmlInput: { "aria-label": label, inputMode: "decimal" } }}
      sx={{ width: 110 }}
    />
  );

  const toolbar = (
    <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
      <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
        <Button
          size="small"
          variant="outlined"
          data-action="new-package"
          disabled={blocked || editing !== undefined}
          onClick={() => open({ kind: "create" })}
        >
          New package
        </Button>
      </Hint>
      <Hint
        hint={
          blocked
            ? WRITES_OFF_HINT
            : "A package built from catalog products; the agent prices it from them."
        }
      >
        <Button
          size="small"
          variant="outlined"
          data-action="new-assembled-package"
          disabled={blocked || editing !== undefined}
          onClick={() => open({ kind: "assemble" })}
        >
          Assemble from products
        </Button>
      </Hint>
      <ConfirmButton
        label="Sync from ad server"
        title="Sync packages from the ad server?"
        confirmLabel="Sync packages"
        action="sync-packages"
        hint="Re-runs the agent's package setup (ProductSetupFlow), which builds packages from the ad server. Each click starts it again, and the console cannot tell what it changes, so don't click repeatedly."
        blocked={blocked}
        pending={sync.pending}
        onConfirm={() => void sync.run({})}
        consequence="Not idempotent: each trigger kicks ProductSetupFlow again."
      />
    </Stack>
  );

  if (list.loading && rows.length === 0) return <Skeleton height={60} />;

  const createProblem =
    (draft.name.trim() ? undefined : "Name the package.") ??
    priceProblem(draft.base) ??
    priceProblem(draft.floor);

  const createRow = editing?.kind === "create" && (
    <TableRow data-row="package" data-editing="true">
      <TableCell>{nameField}</TableCell>
      <TableCell sx={cellSx}>—</TableCell>
      <TableCell>
        {priceField("Base price", "base", "Base (list) price as a plain number, for example 10.")}
      </TableCell>
      <TableCell>
        {priceField("Floor", "floor", "Lowest price the package may be sold at, for example 5.")}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <ConfirmButton
            label="Create"
            title="Create a curated package?"
            confirmLabel="Create package"
            action="create-package"
            variant="contained"
            blocked={blocked}
            pending={create.pending}
            disabled={createProblem !== undefined}
            hint={createProblem}
            onConfirm={() =>
              void settle(
                create.run({
                  name: draft.name.trim(),
                  base_price: Number(draft.base),
                  floor_price: Number(draft.floor),
                }),
              )
            }
            consequence="Not idempotent: each call mints a new package id, so a retry after an unclear failure may leave two."
          />
          {cancel}
        </Stack>
      </TableCell>
    </TableRow>
  );

  const assembleProblem =
    (draft.name.trim() ? undefined : "Name the package.") ??
    (draft.productIds.length > 0 ? undefined : "Choose at least one product.");

  const assembleRow = editing?.kind === "assemble" && (
    <TableRow data-row="package" data-editing="true">
      <TableCell colSpan={4}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {nameField}
          <ProductMultiPicker
            hint="The products to combine into the package. Pick as many as you need, or type or paste ids. Ids that do not resolve to a product are rejected with a 422."
            value={draft.productIds}
            onChange={(ids) => setDraft({ ...draft, productIds: ids })}
            sx={{ minWidth: 360, flex: 1 }}
          />
        </Stack>
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <ConfirmButton
            label="Assemble"
            title="Assemble a dynamic package?"
            action="assemble-package"
            variant="contained"
            blocked={blocked}
            pending={assemble.pending}
            disabled={assembleProblem !== undefined}
            hint={assembleProblem}
            onConfirm={() =>
              void settle(
                assemble.run({ name: draft.name.trim(), product_ids: draft.productIds }),
              )
            }
            consequence="Not idempotent: each call mints a new package. A product id that no longer resolves is refused (422) and nothing is created."
          />
          {cancel}
        </Stack>
      </TableCell>
    </TableRow>
  );

  function editRow(pkg: Package) {
    const body = changes(pkg, draft);
    const problem =
      (draft.name.trim() ? undefined : "A package needs a name.") ??
      (draft.floor.trim() === "" ? undefined : priceProblem(draft.floor)) ??
      (draft.base.trim() === "" ? undefined : priceProblem(draft.base)) ??
      (Object.keys(body).length > 0 ? undefined : "Nothing has changed.");
    return (
      <TableRow key={pkg.package_id} data-row="package" data-editing="true">
        <TableCell>
          <Stack direction="row" spacing={1} alignItems="center">
            {nameField}
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={draft.featured}
                  onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
                />
              }
              label={<Typography sx={{ fontSize: 12 }}>Featured</Typography>}
            />
          </Stack>
        </TableCell>
        <TableCell sx={cellSx}>{pkg.rate_type ?? "—"}</TableCell>
        <TableCell>
          {priceField(
            "Base price",
            "base",
            "Leave blank to keep the stored base price. The price shown in this column is this key's, after its tier discount, so it is not the base.",
            "New base",
          )}
        </TableCell>
        <TableCell>
          {priceField("Floor", "floor", "Lowest price the package may be sold at.")}
        </TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <ConfirmButton
              label="Save"
              title={`Update ${pkg.name || pkg.package_id}?`}
              action="update-package"
              variant="contained"
              blocked={blocked}
              pending={update.pending}
              disabled={problem !== undefined}
              hint={problem}
              onConfirm={() => void settle(update.run({ id: pkg.package_id, body }))}
              consequence={
                <>
                  Sends {Object.keys(body).join(", ") || "nothing"} and leaves every
                  other field as stored. Saving the same values twice is harmless.
                  A package archived meanwhile 404s.
                </>
              }
            />
            {cancel}
          </Stack>
        </TableCell>
      </TableRow>
    );
  }

  function readRow(pkg: Package) {
    return (
      <TableRow key={pkg.package_id} hover data-row="package">
        <TableCell sx={{ fontSize: 13 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>{pkg.name || pkg.package_id}</span>
            {pkg.is_featured && (
              <Chip
                label="featured"
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: 10, color: palette.textSecondary }}
              />
            )}
          </Stack>
        </TableCell>
        <TableCell sx={cellSx}>{pkg.rate_type ?? "—"}</TableCell>
        {/* Exact prices appear only for an authenticated caller; without
            a key the agent returns a band instead. Showing whichever
            arrived, and the section header says whose view this is. */}
        <TableCell sx={cellSx}>
          {pkg.exact_price != null ? plain(pkg.exact_price, pkg.currency) : (pkg.price_range ?? "—")}
        </TableCell>
        <TableCell sx={{ ...cellSx, color: palette.textSecondary }}>
          {plain(pkg.floor_price, pkg.currency)}
        </TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
              <Button
                size="small"
                data-action="edit-package"
                disabled={blocked || editing !== undefined}
                onClick={() =>
                  open(
                    { kind: "edit", id: pkg.package_id },
                    {
                      ...EMPTY,
                      name: pkg.name,
                      featured: pkg.is_featured,
                      floor: pkg.floor_price == null ? "" : String(pkg.floor_price),
                    },
                  )
                }
              >
                Edit
              </Button>
            </Hint>
            <ConfirmButton
              label="Archive"
              title={`Archive ${pkg.name || pkg.package_id}?`}
              confirmLabel="Archive package"
              action="delete-package"
              variant="text"
              color="error"
              blocked={blocked}
              pending={archive.pending}
              disabled={editing !== undefined}
              onConfirm={() => void archive.run({ id: pkg.package_id })}
              consequence="Soft delete: the package is archived and leaves this list. A second archive 404s."
            />
          </Stack>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {toolbar}
      {rows.length === 0 && !editing ? (
        <Paper variant="outlined" sx={{ p: 3 }} data-state="no-packages">
          <Typography variant="body2" color="text.secondary">
            {list.result && list.result.kind !== "ok" ? describe(list.result) : "No packages."}
          </Typography>
        </Paper>
      ) : (
        <DataPanel>
          <Table size="small" data-block="packages">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Package</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Rate</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Floor</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {createRow}
              {assembleRow}
              {rows.map((pkg) =>
                editing?.kind === "edit" && editing.id === pkg.package_id
                  ? editRow(pkg)
                  : readRow(pkg),
              )}
            </TableBody>
          </Table>
        </DataPanel>
      )}
      {[update, archive, create, assemble, sync].map((m, i) => (
        <Failure key={i} last={m.last} />
      ))}
      {sync.last?.kind === "ok" && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="write-ok">
          The agent accepted the sync. New packages appear here once it finishes.
        </Typography>
      )}
    </>
  );
}
