import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  createPackage,
  updatePackage,
  type MediaKitPackage,
  type PackageCreate,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { AD_FORMATS, DEVICE_TYPES, deviceLabel } from "../api/vocabulary";
import { ConfirmButton } from "../components/ConfirmButton";
import { TipField } from "../components/TipField";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { ProductMultiPicker } from "./pickers";
import { palette } from "../theme/palette";
import {
  EMPTY_DRAFT,
  PACKAGE_VIEWS,
  createBody,
  createProblem,
  draftOf,
  packageChanges,
  type PackageDraft,
} from "./package-draft";

/**
 * A free list of short values. Pasted lists arrive as one string and are
 * split on commas, the same as the id pickers; a value typed and left in the
 * box counts (`autoSelect`), so pressing Save never silently drops it.
 */
export function ListField({
  label,
  hint,
  value,
  onChange,
  suggestions = [],
}: {
  label: string;
  hint: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  suggestions?: readonly string[];
}) {
  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      autoSelect
      filterSelectedOptions
      size="small"
      options={[...suggestions]}
      value={[...value]}
      onChange={(_, next) => {
        const items = next
          .flatMap((v) => v.split(","))
          .map((v) => v.trim())
          .filter(Boolean);
        onChange([...new Set(items)]);
      }}
      renderValue={(items, getItemProps) =>
        items.map((item, index) => {
          const { key, ...chip } = getItemProps({ index });
          return <Chip key={key} size="small" label={item} {...chip} />;
        })
      }
      renderInput={(params) => <TipField {...params} hint={hint} label={label} />}
      sx={{ minWidth: 240, flex: 1 }}
    />
  );
}

export function Fields({
  draft,
  onChange,
  withPrices,
  full = false,
}: {
  draft: PackageDraft;
  onChange: (draft: PackageDraft) => void;
  withPrices: boolean;
  /** Also the create-only fields: placements, content categories, audience, season. */
  full?: boolean;
}) {
  const set = <K extends keyof PackageDraft>(key: K, value: PackageDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <TipField
          hint="The package name buyers see in the media kit."
          size="small"
          label="Name"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          sx={{ minWidth: 240 }}
        />
        {withPrices && (
          <>
            <TipField
              hint="Base (list) price as a plain number, for example 10. Buyers see a band derived from it, not the number."
              size="small"
              label="Base price"
              value={draft.base}
              onChange={(e) => set("base", e.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              sx={{ width: 130 }}
            />
            <TipField
              hint="Lowest price the package may be sold at, for example 5."
              size="small"
              label="Floor"
              value={draft.floor}
              onChange={(e) => set("floor", e.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              sx={{ width: 130 }}
            />
          </>
        )}
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={draft.featured}
              onChange={(e) => set("featured", e.target.checked)}
            />
          }
          label={<Typography sx={{ fontSize: 13 }}>Featured</Typography>}
        />
      </Stack>
      <TipField
        hint="What the package is, as buyers read it. Leave blank for none."
        size="small"
        label="Description"
        multiline
        minRows={2}
        value={draft.description}
        onChange={(e) => set("description", e.target.value)}
        fullWidth
      />
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <ListField
          label="Ad formats"
          hint="OpenRTB imp types such as banner or video. Not a closed set — other values are stored as typed."
          value={draft.adFormats}
          onChange={(v) => set("adFormats", v)}
          suggestions={AD_FORMATS}
        />
        <TipField
          hint="AdCOM device types. The agent stores these as numbers; the names are AdCOM's."
          select
          size="small"
          label="Device types"
          value={draft.deviceTypes}
          onChange={(e) => {
            const raw = e.target.value as unknown;
            set(
              "deviceTypes",
              (Array.isArray(raw) ? raw : []).map(Number).sort((a, b) => a - b),
            );
          }}
          slotProps={{
            select: {
              multiple: true,
              renderValue: (v) => (v as number[]).map(deviceLabel).join(", "),
            },
          }}
          sx={{ minWidth: 220 }}
        >
          {DEVICE_TYPES.map((d) => (
            <MenuItem key={d.value} value={d.value}>
              {d.label}
            </MenuItem>
          ))}
        </TipField>
      </Stack>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <ListField
          label="Geo targets"
          hint="ISO 3166 codes, for example US or US-NY. Stored as typed; the agent does not check them."
          value={draft.geoTargets}
          onChange={(v) => set("geoTargets", v)}
        />
        <ListField
          label="Tags"
          hint="Free words buyers can find the package by in media kit search."
          value={draft.tags}
          onChange={(v) => set("tags", v)}
        />
      </Stack>
      {full && (
        <>
          <ProductMultiPicker
            hint="Products the package is built from — its placements. Pick as many as you need, or type or paste ids. Blank creates a package with none."
            value={draft.productIds}
            onChange={(v) => set("productIds", v)}
          />
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <ListField
              label="Content categories"
              hint="IAB content category ids, for example IAB1, read against the taxonomy below."
              value={draft.cat}
              onChange={(v) => set("cat", v)}
            />
            <TipField
              hint="AdCOM number of the taxonomy the categories come from. Blank takes the agent's default, 2 (IAB Content Category Taxonomy 2.0)."
              size="small"
              label="Content taxonomy"
              placeholder="2"
              value={draft.cattax}
              onChange={(e) => set("cattax", e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              sx={{ width: 150 }}
            />
            <TipField
              hint="A label for seasonal packages, such as Q4 holiday. No view returns it, so it can be set here but not read back."
              size="small"
              label="Seasonal label"
              value={draft.seasonalLabel}
              onChange={(e) => set("seasonalLabel", e.target.value)}
              sx={{ minWidth: 180 }}
            />
          </Stack>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <ListField
              label="Audience segment ids"
              hint="Audience segment ids the package targets. Stored as typed; the agent does not check them."
              value={draft.audienceSegmentIds}
              onChange={(v) => set("audienceSegmentIds", v)}
            />
            <TipField
              hint='Which audience taxonomies the package supports, as a JSON object, for example {"standard_taxonomy_version": "1.1", "supports_standard": true}. Blank sends none.'
              size="small"
              label="Audience capabilities"
              multiline
              minRows={2}
              value={draft.audienceCapabilities}
              onChange={(e) => set("audienceCapabilities", e.target.value)}
              slotProps={{
                htmlInput: { spellCheck: false, style: { fontFamily: "monospace", fontSize: 12 } },
              }}
              sx={{ minWidth: 280, flex: 1 }}
            />
          </Stack>
        </>
      )}
    </Stack>
  );
}

export function Failure({ last }: { last: Result<unknown> | undefined }) {
  if (!last || last.kind === "ok") return null;
  return (
    <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
      {describe(last)}
    </Typography>
  );
}

/**
 * Both disclosures matter more here than on the Catalog: `/media-kit` answers
 * every caller, with or without a key (media-kit.ts), so what is saved here is
 * public the moment the agent accepts it.
 */
const PUBLIC = "The media kit is public — anyone who can reach the agent sees this without a key.";

export function CreatePackageForm({ onClose }: { onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [draft, setDraft] = useState<PackageDraft>(EMPTY_DRAFT);
  const create = useMutation<PackageCreate, unknown>((c, body) => createPackage(c, body), {
    invalidates: PACKAGE_VIEWS,
  });
  const problem = createProblem(draft);

  return (
    <Box data-block="media-kit-create-package">
      <Fields draft={draft} onChange={setDraft} withPrices />
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <ConfirmButton
          label="Create"
          title="Create a curated package?"
          confirmLabel="Create package"
          action="media-kit-create-package"
          variant="contained"
          blocked={!writesEnabled}
          pending={create.pending}
          disabled={problem !== undefined}
          hint={problem}
          onConfirm={() =>
            void create.run(createBody(draft)).then((r) => {
              if (r.kind === "ok") onClose();
            })
          }
          consequence={
            <>
              The package is created active, with no products behind it — use Assemble on the
              Catalog to build one from products. {PUBLIC} Not idempotent: each call mints a new
              package id, so a retry after an unclear failure may leave two.
            </>
          }
        />
        <Button size="small" onClick={onClose} disabled={create.pending}>
          Cancel
        </Button>
      </Stack>
      <Failure last={create.last} />
    </Box>
  );
}

export function EditPackageForm({ pkg, onClose }: { pkg: MediaKitPackage; onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [draft, setDraft] = useState<PackageDraft>(() => draftOf(pkg));
  const update = useMutation<{ id: string; body: Record<string, unknown> }, unknown>(
    (c, args) => updatePackage(c, args.id, args.body),
    { invalidates: (args) => [...PACKAGE_VIEWS, `package:${args.id}`] },
  );
  const body = packageChanges(pkg, draft);
  const problem =
    (draft.name.trim() ? undefined : "A package needs a name.") ??
    (Object.keys(body).length > 0 ? undefined : "Nothing has changed.");

  return (
    <Box data-block="media-kit-edit-package" sx={{ py: 1 }}>
      <Fields draft={draft} onChange={setDraft} withPrices={false} />
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <ConfirmButton
          label="Save"
          title={`Update ${pkg.name || pkg.package_id}?`}
          action="media-kit-update-package"
          variant="contained"
          blocked={!writesEnabled}
          pending={update.pending}
          disabled={problem !== undefined}
          hint={problem}
          onConfirm={() =>
            void update.run({ id: pkg.package_id, body }).then((r) => {
              if (r.kind === "ok") onClose();
            })
          }
          consequence={
            <>
              Sends {Object.keys(body).join(", ") || "nothing"} and leaves every other field —
              prices and placements included — as stored. {PUBLIC} Saving the same values twice is
              harmless. A package archived meanwhile 404s.
            </>
          }
        />
        <Button size="small" onClick={onClose} disabled={update.pending}>
          Cancel
        </Button>
      </Stack>
      <Failure last={update.last} />
    </Box>
  );
}
