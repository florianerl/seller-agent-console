import { Fragment, useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
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
  deletePackage,
  mediaKit,
  mediaKitPackage,
  mediaKitPackages,
  searchMediaKit,
  type MediaKitPackage,
  type MediaKitPackageQuery,
  type MediaKitSearchQuery,
} from "../api/endpoints";
import { describe } from "../api/errors";
import { AUDIENCE_TYPES, PACKAGE_LAYERS, deviceLabel, type AudienceType } from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { plain } from "../lib/money";
import { ConfirmButton, WRITES_OFF_HINT } from "../components/ConfirmButton";
import { Hint } from "../components/Hint";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ScreenSection } from "../components/ScreenSection";
import { StatusCard } from "../components/StatusCard";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { FormRow } from "../components/WriteForm";
import { TipField } from "../components/TipField";
import { AudienceMatchForm } from "./AudienceMatch";
import { CreatePackageForm, EditPackageForm, Failure } from "./MediaKitPackageForm";
import { PACKAGE_VIEWS } from "./package-draft";
import { BuyerIdentityFields } from "./BuyerIdentityFields";
import { NO_IDENTITY, identityBody, identityLabel, type BuyerIdentity } from "./buyer-identity";
import { palette } from "../theme/palette";

/**
 * `asOf` on a resource is an epoch millisecond, not the ISO string `stamp`
 * expects — there is no per-package timestamp in this payload to format
 * instead. Round-tripping through ISO keeps one formatting rule for every
 * displayed time in the console rather than a second, epoch-only one just for
 * this screen.
 */
function asOfStamp(at: number): string {
  return stamp(new Date(at).toISOString());
}

function featuredCell(featured: boolean) {
  return featured ? (
    <Chip
      label="featured"
      size="small"
      variant="outlined"
      sx={{ height: 18, fontSize: 10, color: palette.textSecondary }}
    />
  ) : (
    <Box component="span" sx={{ color: palette.textSecondary }}>
      —
    </Box>
  );
}

function Summary() {
  // `/media-kit` ignores the key entirely (see media-kit.ts), so `blocked`
  // should never fire here in practice — handled anyway because a resource's
  // freshness states are a contract, not a suggestion, and an agent that
  // starts enforcing a key on this route should degrade the card, not crash it.
  const summary = useResource("media-kit-summary", mediaKit, {
    refreshInterval: CADENCE.mediaKit,
  });

  if (summary.freshness === "blocked") {
    return <GatedNotice what="The media kit summary" result={summary.result} />;
  }

  return (
    <StatusCard title="Media kit" testId="media-kit-summary" resource={summary}>
      {(data) => (
        <FieldGrid min={110}>
          <Field label="Packages">{data.total_packages.toLocaleString()}</Field>
          <Field label="Featured">{data.featured_count.toLocaleString()}</Field>
          {/* `all_packages` is the same list the Packages table reads, so it
              is not repeated here; the featured ones are named because
              nothing else on the screen picks them out at a glance. */}
          <Field label="Featured packages">
            {data.featured.map((p) => p.name || p.package_id).join(", ") || "—"}
          </Field>
        </FieldGrid>
      )}
    </StatusCard>
  );
}

function PackageDetail({ packageId }: { packageId: string }) {
  const detail = useResource(`media-kit-package:${packageId}`, (c, signal) =>
    mediaKitPackage(c, packageId, signal),
  );

  if (detail.loading && !detail.data) return <Skeleton height={60} />;

  if (detail.freshness === "blocked") {
    return <GatedNotice what="This package's detail" result={detail.result} />;
  }

  if (!detail.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const pkg = detail.data;
  const caps = pkg.audience_capabilities;

  return (
    <Stack spacing={1.5} sx={{ py: 1 }} data-block="media-kit-package-detail">
      <FieldGrid min={140}>
        <Field label="Description">{pkg.description ?? "—"}</Field>
        <Field label="Device types">{pkg.device_types.map(deviceLabel).join(", ") || "—"}</Field>
        <Field label="Geo targets">{pkg.geo_targets.join(", ") || "—"}</Field>
        <Field label="Tags">{pkg.tags.join(", ") || "—"}</Field>
        <Field label="Content categories">
          {pkg.cat.length
            ? `${pkg.cat.join(", ")}${pkg.cattax != null ? ` (cattax ${pkg.cattax})` : ""}`
            : "—"}
        </Field>
        <Field label="Standard taxonomy">
          {caps?.supports_standard ? (caps.standard_taxonomy_version ?? "yes") : "no"}
        </Field>
        <Field label="Contextual taxonomy">
          {caps?.supports_contextual ? (caps.contextual_taxonomy_version ?? "yes") : "no"}
        </Field>
        <Field label="Agentic">
          {caps?.supports_agentic ? (caps.agentic_spec_version ?? "yes") : "no"}
        </Field>
      </FieldGrid>
      <Typography
        variant="caption"
        data-freshness={detail.freshness}
        sx={{ color: palette.textSecondary }}
      >
        {detail.freshness === "live" &&
          detail.asOf !== undefined &&
          `as of ${asOfStamp(detail.asOf)}`}
        {detail.freshness === "stale" &&
          detail.asOf !== undefined &&
          `couldn't refresh — showing ${asOfStamp(detail.asOf)}`}
      </Typography>
    </Stack>
  );
}

/**
 * The type/id/version audience triple the list and search filters share. The
 * list takes it as `audience_*` query params, search as `audience_filter`;
 * the rules are the same (`_build_audience_filter` upstream).
 */
type AudienceDraft = { type: AudienceType | ""; id: string; version: string };
const NO_AUDIENCE: AudienceDraft = { type: "", id: "", version: "" };

function audienceProblem(a: AudienceDraft): string | undefined {
  return a.id.trim() && !a.type
    ? "An audience id needs a type: the agent cannot tell which taxonomy to look it up in (400)."
    : undefined;
}

function AudienceFields({
  value,
  onChange,
}: {
  value: AudienceDraft;
  onChange: (value: AudienceDraft) => void;
}) {
  return (
    <>
      <EnumSelect
        label="Audience type"
        hint="Only packages that declare this kind of audience. Agentic with an id currently means only 'supports agentic' upstream."
        value={value.type}
        options={AUDIENCE_TYPES}
        any="Any audience"
        onChange={(type) => onChange({ ...value, type })}
        sx={{ minWidth: 160 }}
      />
      <TipField
        hint="A segment id within that type, for example 3-7 for the standard taxonomy. Needs a type."
        size="small"
        label="Audience id"
        value={value.id}
        onChange={(e) => onChange({ ...value, id: e.target.value })}
        sx={{ width: 140 }}
      />
      <TipField
        hint="Taxonomy version to match, for example 1.1. Blank matches any."
        size="small"
        label="Taxonomy version"
        value={value.version}
        onChange={(e) => onChange({ ...value, version: e.target.value })}
        sx={{ width: 140 }}
      />
    </>
  );
}

type ListFilters = { layer: string; featuredOnly: boolean; audience: AudienceDraft };
const NO_FILTERS: ListFilters = { layer: "", featuredOnly: false, audience: NO_AUDIENCE };

/** Blank filters are left off the URL rather than sent empty. */
function listQuery(f: ListFilters): MediaKitPackageQuery {
  const q: MediaKitPackageQuery = {};
  if (f.layer) q.layer = f.layer;
  if (f.featuredOnly) q.featured_only = true;
  if (f.audience.type) q.audience_type = f.audience.type;
  if (f.audience.id.trim()) q.audience_id = f.audience.id.trim();
  if (f.audience.version.trim()) q.audience_taxonomy_version = f.audience.version.trim();
  return q;
}

function ListFilterForm({ onApply }: { onApply: (query: MediaKitPackageQuery) => void }) {
  const [draft, setDraft] = useState<ListFilters>(NO_FILTERS);
  const problem = audienceProblem(draft.audience);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!problem) onApply(listQuery(draft));
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 1.5 }} data-block="media-kit-filters">
      <FormRow>
        <EnumSelect
          label="Layer"
          hint="How the package came to exist: synced from the ad server, curated by the seller, or assembled by the agent."
          value={draft.layer}
          options={PACKAGE_LAYERS}
          any="Any layer"
          onChange={(layer) => setDraft({ ...draft, layer })}
          sx={{ minWidth: 140 }}
        />
        <AudienceFields
          value={draft.audience}
          onChange={(audience) => setDraft({ ...draft, audience })}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={draft.featuredOnly}
              onChange={(e) => setDraft({ ...draft, featuredOnly: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontSize: 13 }}>Featured only</Typography>}
        />
        <Hint hint={problem}>
          <Button
            type="submit"
            size="small"
            variant="outlined"
            disabled={problem !== undefined}
            data-action="media-kit-filter"
          >
            Filter
          </Button>
        </Hint>
      </FormRow>
    </Box>
  );
}

/** Which row is expanded, and as what. Only one at a time, like the Catalog's table. */
type Open = { kind: "detail" | "edit"; id: string } | { kind: "create" };

function PackagesTable() {
  const { writesEnabled } = useCredential();
  const [open, setOpen] = useState<Open | undefined>();
  const blocked = !writesEnabled;

  // Archive lives on the row rather than in a form, so its outcome is shown
  // under the table; the create and edit forms show their own.
  const archive = useMutation<{ id: string }, unknown>((c, args) => deletePackage(c, args.id), {
    invalidates: (args) => [...PACKAGE_VIEWS, `package:${args.id}`],
  });
  const editing = open !== undefined && open.kind !== "detail";

  function toggle(next: Open) {
    archive.reset();
    setOpen((current) =>
      current?.kind === next.kind && "id" in current && "id" in next && current.id === next.id
        ? undefined
        : next,
    );
  }

  // Keyed on the applied filters, so each filter set is its own SWR entry;
  // every key still starts "media-kit", which is what a package write
  // invalidates (PACKAGE_VIEWS).
  const [query, setQuery] = useState<MediaKitPackageQuery>({});
  const filtered = Object.keys(query).length > 0;
  const list = useResource(
    `media-kit-packages:${JSON.stringify(query)}`,
    (c, signal) => mediaKitPackages(c, query, signal),
    {
      refreshInterval: CADENCE.mediaKit,
    },
  );
  const rows = list.data?.packages ?? [];

  if (list.freshness === "blocked") {
    return <GatedNotice what="The package list" result={list.result} />;
  }

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
          <Button
            size="small"
            variant="outlined"
            data-action="media-kit-new-package"
            disabled={blocked || editing}
            onClick={() => toggle({ kind: "create" })}
          >
            New package
          </Button>
        </Hint>
      </Stack>
      <ListFilterForm onApply={setQuery} />
      {open?.kind === "create" && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <CreatePackageForm onClose={() => setOpen(undefined)} />
        </Paper>
      )}

      <FreshnessNote freshness={list.freshness}>
        {list.freshness === "live" &&
          `${plural(rows.length, "package")}${filtered ? " matching the filters" : ""} · as of ${asOfStamp(list.asOf!)}`}
        {list.freshness === "stale" && "couldn't refresh — showing the last packages received"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
      </FreshnessNote>

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
                : filtered
                  ? "No packages match these filters."
                  : "No packages yet."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Package</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Ad formats</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Device types</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Rate</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Featured</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((pkg) => (
                <Fragment key={pkg.package_id}>
                  <TableRow hover data-row="media-kit-package">
                    <TableCell sx={{ fontSize: 13 }}>{pkg.name || pkg.package_id}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{pkg.ad_formats.join(", ") || "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {pkg.device_types.map(deviceLabel).join(", ") || "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{pkg.price_range ?? "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {pkg.rate_type ?? "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{featuredCell(pkg.is_featured)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          disabled={editing}
                          onClick={() => toggle({ kind: "detail", id: pkg.package_id })}
                          aria-expanded={isOpen(open, "detail", pkg.package_id)}
                        >
                          {isOpen(open, "detail", pkg.package_id) ? "Hide details" : "Details"}
                        </Button>
                        <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
                          <Button
                            size="small"
                            data-action="media-kit-edit-package"
                            disabled={blocked || editing}
                            onClick={() => toggle({ kind: "edit", id: pkg.package_id })}
                          >
                            Edit
                          </Button>
                        </Hint>
                        <ConfirmButton
                          label="Archive"
                          title={`Archive ${pkg.name || pkg.package_id}?`}
                          confirmLabel="Archive package"
                          action="media-kit-archive-package"
                          variant="text"
                          color="error"
                          blocked={blocked}
                          pending={archive.pending}
                          disabled={editing}
                          onConfirm={() => void archive.run({ id: pkg.package_id })}
                          consequence="Soft delete: the package is archived and leaves the media kit for every buyer. Nothing in the console lists archived packages, so undoing it means a PUT of status by id outside the console. A second archive 404s."
                        />
                      </Stack>
                    </TableCell>
                  </TableRow>
                  {isOpen(open, "detail", pkg.package_id) && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ backgroundColor: palette.ground }}>
                        <PackageDetail packageId={pkg.package_id} />
                      </TableCell>
                    </TableRow>
                  )}
                  {isOpen(open, "edit", pkg.package_id) && (
                    <TableRow data-editing="true">
                      <TableCell colSpan={7} sx={{ backgroundColor: palette.ground }}>
                        <EditPackageForm pkg={pkg} onClose={() => setOpen(undefined)} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </DataPanel>
      <Failure last={archive.last} />
    </>
  );
}

function isOpen(open: Open | undefined, kind: "detail" | "edit", id: string): boolean {
  return open?.kind === kind && open.id === id;
}

/**
 * What a search result costs. The agent answers with the authenticated view —
 * exact, tier-adjusted price and floor — whenever the caller has a key or
 * names a tier above public, and with the public band otherwise.
 */
function priceCell(pkg: MediaKitPackage): string {
  if (pkg.exact_price == null) return pkg.price_range ?? "—";
  const floor = pkg.floor_price == null ? "" : ` · floor ${plain(pkg.floor_price, pkg.currency)}`;
  return `${plain(pkg.exact_price, pkg.currency)}${floor}`;
}

function SearchResults({ body }: { body: MediaKitSearchQuery }) {
  // Keyed on the whole submitted body, exactly like Agents.tsx keys its
  // resource on the active filters — a new key is a new SWR entry, so
  // changing any field re-fetches without ever needing a mutation seam. This
  // is a POST, but it answers a question and stores nothing (see
  // searchMediaKit's comment and QUERY_SHAPED_PATHS in policy.ts), so it goes
  // through useResource, not useMutation, and runs even with writes off.
  const results = useResource(`media-kit-search:${JSON.stringify(body)}`, (c, signal) =>
    searchMediaKit(c, body, signal),
  );
  const rows = results.data?.results ?? [];
  const query = body.query;
  const asWho = identityLabel(body);
  const scope = [asWho && `as ${asWho}`, body.audience_filter && "audience-filtered"]
    .filter(Boolean)
    .join(", ");

  if (results.freshness === "blocked") {
    return <GatedNotice what="Media kit search" result={results.result} />;
  }

  return (
    <Box sx={{ mt: 2 }} data-block="media-kit-search-results">
      <Box
        data-freshness={results.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: results.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {results.freshness === "live" &&
          `${plural(rows.length, "match", "matches")} for "${query}"${scope ? ` (${scope})` : ""} · as of ${asOfStamp(results.asOf!)}`}
        {results.freshness === "stale" &&
          `couldn't refresh — showing the last results for "${query}"`}
        {results.freshness === "empty" &&
          (results.loading ? "searching…" : results.result ? describe(results.result) : "")}
      </Box>

      {results.loading && rows.length === 0 ? (
        <Skeleton height={28} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-matches">
          {results.freshness === "empty" && results.result?.kind === "unavailable"
            ? describe(results.result)
            : `No packages match "${query}".`}
        </Typography>
      ) : (
        <Table size="small" data-block="media-kit-search-table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Package</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Ad formats</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Device types</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Rate</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Products</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Featured</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((pkg) => (
              <TableRow key={pkg.package_id} hover data-row="media-kit-search-result">
                <TableCell sx={{ fontSize: 13 }}>{pkg.name || pkg.package_id}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{pkg.ad_formats.join(", ") || "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  {pkg.device_types.map(deviceLabel).join(", ") || "—"}
                </TableCell>
                <TableCell sx={{ fontSize: 12 }}>{priceCell(pkg)}</TableCell>
                <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {pkg.rate_type ?? "—"}
                  {pkg.negotiation_enabled && " · negotiable"}
                  {pkg.volume_discounts_available && " · volume discounts"}
                </TableCell>
                {/* Placements come only with the authenticated view; the
                    public one has none to show, which is not the same as
                    a package with no products. */}
                <TableCell sx={{ fontSize: 12 }}>
                  {pkg.exact_price == null
                    ? "—"
                    : pkg.placements.map((p) => p.product_name || p.product_id).join(", ") ||
                      "none"}
                </TableCell>
                <TableCell sx={{ fontSize: 12 }}>{featuredCell(pkg.is_featured)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

/** Every field of `MediaKitSearchRequest`; blanks are left out, so the agent's defaults apply. */
function searchBody(
  query: string,
  identity: BuyerIdentity,
  audience: AudienceDraft,
): MediaKitSearchQuery {
  const body: MediaKitSearchQuery = { query, ...identityBody(identity, { advertiser: true }) };
  if (audience.type || audience.id.trim() || audience.version.trim()) {
    body.audience_filter = {
      ...(audience.type && { audience_type: audience.type }),
      ...(audience.id.trim() && { audience_id: audience.id.trim() }),
      ...(audience.version.trim() && { taxonomy_version: audience.version.trim() }),
    };
  }
  return body;
}

function Search() {
  const [queryInput, setQueryInput] = useState("");
  const [identity, setIdentity] = useState<BuyerIdentity>(NO_IDENTITY);
  const [audience, setAudience] = useState<AudienceDraft>(NO_AUDIENCE);
  // undefined means "nothing submitted yet" — kept distinct from "" so
  // <SearchResults> mounts (and therefore fetches) only once the operator has
  // actually submitted, never on the keystrokes that fill the field.
  const [submitted, setSubmitted] = useState<MediaKitSearchQuery | undefined>(undefined);
  const problem = audienceProblem(audience);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem) return;
    const trimmed = queryInput.trim();
    setSubmitted(trimmed ? searchBody(trimmed, identity, audience) : undefined);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={1.5}>
          <FormRow>
            <TipField
              hint="Words to look for in the media kit's packages — names, descriptions, tags, content categories and audience segment ids. Searching happens only when you submit; a blank search submits nothing."
              size="small"
              label="Search the media kit"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              sx={{ minWidth: 280 }}
            />
            <Hint hint={problem}>
              <Button
                type="submit"
                variant="outlined"
                size="small"
                data-action="search"
                disabled={problem !== undefined}
              >
                Search
              </Button>
            </Hint>
          </FormRow>
          {/* This console always sends its key, so results come back in the
              authenticated view whatever the tier says; the tier and ids
              choose which buyer's prices that view shows. */}
          <FormRow>
            <BuyerIdentityFields value={identity} onChange={setIdentity} advertiser />
            <AudienceFields value={audience} onChange={setAudience} />
          </FormRow>
        </Stack>
      </Box>

      {submitted !== undefined && <SearchResults body={submitted} />}
    </Paper>
  );
}

export default function MediaKitScreen() {
  return (
    <section data-screen="media-kit">
      <PageHeader
        title="Media kit"
        subtitle="The packages this agent publishes to buyers, with full-text search over them. Packages can be created, edited and archived here; prices are edited on the Catalog."
      >
        <ScreenSection title="Summary">
          <Box sx={{ mb: 0, maxWidth: 360 }}>
            <Summary />
          </Box>
        </ScreenSection>

        <ScreenSection title="Search" caption="A query-shaped POST — it runs with writes off.">
          <Search />
        </ScreenSection>

        <ScreenSection title="Audience">
          <AudienceMatchForm />
        </ScreenSection>

        <ScreenSection title="Packages">
          <PackagesTable />
        </ScreenSection>
      </PageHeader>
    </section>
  );
}
