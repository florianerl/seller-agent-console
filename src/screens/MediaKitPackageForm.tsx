import { useMemo, useState } from "react";
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
import {
  AD_FORMATS,
  CATEGORY_TAXONOMIES,
  COUNTRY_CODES,
  DEVICE_TYPES,
  LISTED_CATTAX,
  countryName,
  deviceLabel,
} from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { useTaxonomy } from "../data/taxonomies";
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
  editProblem,
  packageChanges,
  type PackageDraft,
} from "./package-draft";

/** Built once: the browser's names for the ISO codes, for the geo picker. */
const COUNTRIES: ReadonlyMap<string, string> = new Map(
  COUNTRY_CODES.map((code) => [code, countryName(code) ?? code]),
);

/** Enough to pick from; a taxonomy has 1,500 entries and a search narrows it. */
const MAX_OPTIONS = 60;

/**
 * How well a code answers what was typed: the exact code, then a code
 * prefix, then a name that starts with it, then a name that contains it.
 * "us" ranks US above Australia and Belarus, whose names merely contain it.
 * 4 is no match. Stable sort keeps the list's own order within a rank.
 */
function rank(code: string, name: string | undefined, q: string): number {
  const c = code.toLowerCase();
  if (c === q) return 0;
  if (c.startsWith(q)) return 1;
  const n = name?.toLowerCase();
  if (n?.startsWith(q) || n?.split(" › ").some((tier) => tier.startsWith(q))) return 2;
  if (c.includes(q) || n?.includes(q)) return 3;
  return 4;
}

/**
 * What a typed entry adds to a listed field: the code it names when one code
 * answers it best — "germ" is DE, "us" is US — nothing when several do, so
 * the operator picks from the open list instead of getting the literal
 * text, and the text itself when nothing in the list matches (US-NY, a
 * vendor code). A literal "germ" is never a useful geo target.
 */
function resolve(text: string, names: ReadonlyMap<string, string>): string[] {
  const q = text.toLowerCase();
  let best = 4;
  let found: string[] = [];
  for (const [code, name] of names) {
    const r = rank(code, name, q);
    if (r < best) {
      best = r;
      found = [code];
    } else if (r === best && r < 4) {
      found.push(code);
    }
  }
  if (best === 4) return [text];
  if (best === 0) return [found[0]!];
  return best <= 2 && found.length === 1 ? found : [];
}

/** The last tier of a taxonomy path, which is what a chip has room for. */
function leaf(path: string): string {
  return path.split(" › ").pop() ?? path;
}

/**
 * A free list of short values. Pasted lists arrive as one string and are
 * split on commas, the same as the id pickers; a value typed and left in the
 * box counts (`autoSelect`), so pressing Save never silently drops it.
 *
 * With `names` (code → name) it is a picker over that list: the search
 * matches names as well as codes, options and chips show the name, and what
 * is sent is still the code. A code outside the list is kept, not refused —
 * the agent checks none of these fields, and a value read from a package
 * must survive an edit that does not touch it.
 */
export function ListField({
  label,
  hint,
  value,
  onChange,
  suggestions = [],
  names,
}: {
  label: string;
  hint: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  suggestions?: readonly string[];
  names?: ReadonlyMap<string, string> | undefined;
}) {
  // A taxonomy is 1,500 codes; rebuilt on every keystroke it is most of the
  // field's render cost.
  const options = useMemo(
    () => (names ? [...names.keys()] : [...suggestions]),
    [names, suggestions],
  );
  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      autoSelect
      filterSelectedOptions
      size="small"
      options={options}
      // Highlights the best match as a guide. MUI does not let it decide what
      // Enter adds in free-text mode — typed text wins — so `resolve` below
      // does that.
      autoHighlight={names !== undefined}
      filterOptions={(codes, state) => {
        const q = state.inputValue.trim().toLowerCase();
        const open = codes.filter((c) => !value.includes(c));
        if (!q) return open.slice(0, MAX_OPTIONS);
        return open
          .map((c) => ({ c, rank: rank(c, names?.get(c), q) }))
          .filter((h) => h.rank < 4)
          .sort((a, b) => a.rank - b.rank)
          .slice(0, MAX_OPTIONS)
          .map((h) => h.c);
      }}
      renderOption={(props, code) => {
        const { key, ...rest } = props;
        const name = names?.get(code);
        return (
          <li {...rest} key={key}>
            {name ? (
              <Box sx={{ minWidth: 0 }}>
                <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12, mr: 1 }}>
                  {code}
                </Box>
                <Box component="span" sx={{ fontSize: 13 }}>
                  {name}
                </Box>
              </Box>
            ) : (
              code
            )}
          </li>
        );
      }}
      value={[...value]}
      onChange={(_, next) => {
        const items = next
          .flatMap((v) => v.split(","))
          .map((v) => v.trim())
          .filter(Boolean)
          // What is already chosen is never re-resolved: a stored code the
          // list does not know must survive an edit that leaves it alone.
          .flatMap((v) => (!names || value.includes(v) ? [v] : resolve(v, names)));
        onChange([...new Set(items)]);
      }}
      renderValue={(items, getItemProps) =>
        items.map((item, index) => {
          const { key, ...chip } = getItemProps({ index });
          const name = names?.get(item);
          return (
            <Chip
              key={key}
              size="small"
              label={name ? `${leaf(name)} · ${item}` : item}
              title={name}
              {...chip}
            />
          );
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
  classification = full,
}: {
  draft: PackageDraft;
  onChange: (draft: PackageDraft) => void;
  withPrices: boolean;
  /** Also the create-only fields: placements, content categories, audience, season. */
  full?: boolean;
  /**
   * Content categories, their taxonomy and the seasonal label, without the
   * rest of `full`. The edit form wants these: the PUT takes them, and unlike
   * placements and audience capabilities, sending them replaces nothing the
   * form cannot show.
   */
  classification?: boolean;
}) {
  const set = <K extends keyof PackageDraft>(key: K, value: PackageDraft[K]) =>
    onChange({ ...draft, [key]: value });
  // Loaded only once a field that offers them is on screen, and the content
  // list only while the chosen taxonomy is the one it lists.
  const content = useTaxonomy(
    classification && draft.cattax === LISTED_CATTAX ? "content-3.1" : undefined,
  );
  const audience = useTaxonomy(full ? "audience-1.1" : undefined);
  // A stored code the list does not hold (a vendor taxonomy, 500 and up)
  // stays selectable rather than reading as blank.
  const taxonomies =
    draft.cattax.trim() && !CATEGORY_TAXONOMIES.some((t) => t.value === draft.cattax)
      ? [
          ...CATEGORY_TAXONOMIES,
          { value: draft.cattax, label: `${draft.cattax} · not an AdCOM taxonomy` },
        ]
      : CATEGORY_TAXONOMIES;

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
          hint="Countries by name or ISO code. Subdivisions such as US-NY can be typed. Stored as entered; the agent does not check them."
          value={draft.geoTargets}
          onChange={(v) => set("geoTargets", v)}
          names={COUNTRIES}
        />
        <ListField
          label="Tags"
          hint="Free words buyers can find the package by in media kit search."
          value={draft.tags}
          onChange={(v) => set("tags", v)}
        />
      </Stack>
      {full && (
        <ProductMultiPicker
          hint="Products the package is built from — its placements. Pick as many as you need, or type or paste ids. Blank creates a package with none."
          value={draft.productIds}
          onChange={(v) => set("productIds", v)}
        />
      )}
      {classification && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <EnumSelect
            label="Content taxonomy"
            hint="Which AdCOM taxonomy the categories come from. Choose Content 3.1 to pick categories from its list. Left as the agent's default, a new package gets 2, a deprecated taxonomy."
            value={draft.cattax}
            options={taxonomies}
            any="Agent's default (2)"
            onChange={(v) => set("cattax", v)}
            sx={{ minWidth: 220 }}
          />
          <ListField
            label="Content categories"
            hint={
              content
                ? `Categories from the ${content.title}, by name or id. ${content.attribution}`
                : "Category ids from the chosen taxonomy, typed or pasted. Choose Content 3.1 as the taxonomy to pick from its list."
            }
            value={draft.cat}
            onChange={(v) => set("cat", v)}
            names={content?.names}
          />
          <TipField
            hint="A label for seasonal packages, such as Q4 holiday. No view returns it, so the current one cannot be shown: blank leaves it as stored, and anything typed replaces it."
            size="small"
            label="Seasonal label"
            value={draft.seasonalLabel}
            onChange={(e) => set("seasonalLabel", e.target.value)}
            sx={{ minWidth: 180 }}
          />
        </Stack>
      )}
      {full && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <ListField
            label="Audience segment ids"
            hint={`Segments from the IAB Audience Taxonomy 1.1, by name or id — the version the agent files these under. Ids outside the list are kept as typed.${audience ? ` ${audience.attribution}` : ""}`}
            value={draft.audienceSegmentIds}
            onChange={(v) => set("audienceSegmentIds", v)}
            names={audience?.names}
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
      <Fields draft={draft} onChange={setDraft} withPrices full />
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
              The package is created active, curated
              {draft.productIds.length > 0
                ? ", with a placement for each product that resolves; an id that does not is reported back, and if none resolve nothing is created (422)."
                : ", with no products behind it."}{" "}
              {PUBLIC} Not idempotent: each call mints a new package id, so a retry after an unclear
              failure may leave two.
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
  const problem = editProblem(pkg, draft);

  return (
    <Box data-block="media-kit-edit-package" sx={{ py: 1 }}>
      <Fields draft={draft} onChange={setDraft} withPrices={false} classification />
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
              prices, placements and audience capabilities included — as stored. {PUBLIC} Saving the
              same values twice is harmless. A package archived meanwhile 404s.
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
