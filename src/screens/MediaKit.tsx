import { Fragment, useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { mediaKit, mediaKitPackage, mediaKitPackages, searchMediaKit } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusCard } from "../components/StatusCard";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
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
        <Field label="Geo targets">{pkg.geo_targets.join(", ") || "—"}</Field>
        <Field label="Tags">{pkg.tags.join(", ") || "—"}</Field>
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
      <Typography variant="caption" data-freshness={detail.freshness} sx={{ color: palette.textSecondary }}>
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

function PackagesTable() {
  const [openPackage, setOpenPackage] = useState<string | undefined>();

  const list = useResource("media-kit-packages", mediaKitPackages, {
    refreshInterval: CADENCE.mediaKit,
  });
  const rows = list.data?.packages ?? [];

  if (list.freshness === "blocked") {
    return <GatedNotice what="The package list" result={list.result} />;
  }

  return (
    <>
      <Box
        data-freshness={list.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {list.freshness === "live" &&
          `${plural(rows.length, "package")} · as of ${asOfStamp(list.asOf!)}`}
        {list.freshness === "stale" && "couldn't refresh — showing the last packages received"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
      </Box>

      <Paper variant="outlined">
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
                      {pkg.device_types.join(", ") || "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{pkg.price_range ?? "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {pkg.rate_type ?? "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{featuredCell(pkg.is_featured)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() =>
                          setOpenPackage((current) =>
                            current === pkg.package_id ? undefined : pkg.package_id,
                          )
                        }
                        aria-expanded={openPackage === pkg.package_id}
                      >
                        {openPackage === pkg.package_id ? "Hide details" : "Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {openPackage === pkg.package_id && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ backgroundColor: palette.ground }}>
                        <PackageDetail packageId={pkg.package_id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </>
  );
}

function SearchResults({ query }: { query: string }) {
  // Keyed on the submitted query string, exactly like Agents.tsx keys its
  // resource on the active filters — a new key is a new SWR entry, so
  // changing the query re-fetches without ever needing a mutation seam. This
  // is a POST, but it answers a question and stores nothing (see
  // searchMediaKit's comment and QUERY_SHAPED_PATHS in policy.ts), so it goes
  // through useResource, not useMutation, and runs even with writes off.
  const results = useResource(`media-kit-search:${query}`, (c, signal) =>
    searchMediaKit(c, { query }, signal),
  );
  const rows = results.data?.results ?? [];

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
          `${plural(rows.length, "match", "matches")} for "${query}" · as of ${asOfStamp(results.asOf!)}`}
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
              <TableCell sx={{ fontWeight: 600 }}>Featured</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((pkg) => (
              <TableRow key={pkg.package_id} hover data-row="media-kit-search-result">
                <TableCell sx={{ fontSize: 13 }}>{pkg.name || pkg.package_id}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{pkg.ad_formats.join(", ") || "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{pkg.device_types.join(", ") || "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{pkg.price_range ?? "—"}</TableCell>
                <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {pkg.rate_type ?? "—"}
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

function Search() {
  const [queryInput, setQueryInput] = useState("");
  // undefined means "nothing submitted yet" — kept distinct from "" so
  // <SearchResults> mounts (and therefore fetches) only once the operator has
  // actually submitted, never on the keystrokes that fill the field.
  const [submittedQuery, setSubmittedQuery] = useState<string | undefined>(undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = queryInput.trim();
    setSubmittedQuery(trimmed || undefined);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Search the media kit"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            sx={{ minWidth: 280 }}
          />
          <Button type="submit" variant="outlined" size="small" data-action="search">
            Search
          </Button>
        </Stack>
      </Box>

      {submittedQuery !== undefined && <SearchResults query={submittedQuery} />}
    </Paper>
  );
}

export default function MediaKitScreen() {
  return (
    <section data-screen="media-kit">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Media kit
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        The packages this agent publishes to buyers, with full-text search over them.
      </Typography>

      <Box sx={{ mb: 3, maxWidth: 320 }}>
        <Summary />
      </Box>

      <Search />

      <PackagesTable />
    </section>
  );
}
