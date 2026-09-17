import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
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
import { curatorById, curators, type CuratorFee } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * A bare number is ambiguous between a percent of media cost and a CPM
 * surcharge, and the two read completely differently against a price. Every
 * place a fee is shown carries its type and currency alongside the value so
 * "10" is never left to mean whichever the reader assumes.
 */
function fee(f: CuratorFee | null | undefined): string {
  if (!f) return "—";
  if (f.fee_type === "percent") return `${f.fee_value}% of media cost`;
  if (f.fee_type === "cpm") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: f.currency || "USD",
    }).format(f.fee_value) + " CPM";
  }
  // An unrecognised fee_type still gets the value and currency, rather than
  // being silently dropped because it didn't match the two known shapes.
  return `${f.fee_value} ${f.currency || ""} (${f.fee_type})`.trim();
}

function Detail({ curatorId }: { curatorId: string }) {
  const detail = useResource(`curator:${curatorId}`, (c, signal) =>
    curatorById(c, curatorId, signal),
  );

  if (detail.freshness === "blocked") {
    return <GatedNotice what="Curator detail" result={detail.result} />;
  }

  if (detail.loading && !detail.data) return <Skeleton height={24} />;

  if (!detail.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const c = detail.data;

  return (
    <Stack spacing={1.5} sx={{ py: 1 }}>
      <FieldGrid data-block="curator-detail">
        <Field label="Audience segments">
          {c.audience_segments.length === 0 ? "—" : c.audience_segments.join(", ")}
        </Field>
        <Field label="Content categories">
          {c.content_categories.length === 0 ? "—" : c.content_categories.join(", ")}
        </Field>
        <Field label="Tags">{c.tags.length === 0 ? "—" : c.tags.join(", ")}</Field>
      </FieldGrid>
      <Typography
        variant="caption"
        component="p"
        data-freshness={detail.freshness}
        sx={{ color: detail.freshness === "stale" ? palette.warningText : palette.textSecondary }}
      >
        {detail.freshness === "live" && detail.asOf !== undefined && `as of ${stamp(new Date(detail.asOf).toISOString())}`}
        {detail.freshness === "stale" && "couldn't refresh — showing the last detail received"}
      </Typography>
    </Stack>
  );
}

export default function CuratorsScreen() {
  const [activeOnly, setActiveOnly] = useState("");
  const [openCurator, setOpenCurator] = useState<string | undefined>();

  const list = useResource(
    "curators",
    (c, signal) => curators(c, signal),
    { refreshInterval: CADENCE.curators },
  );

  const allRows = list.data?.curators ?? [];
  const rows =
    activeOnly === "" ? allRows : allRows.filter((c) => String(c.is_active) === activeOnly);

  return (
    <section data-screen="curators">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Curators
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Third-party deal and supply-path optimizers registered with this
        seller. Read-only — registering a curator and creating curated deals
        happen elsewhere.
      </Typography>

      {list.freshness === "blocked" ? (
        <GatedNotice what="The curator list" result={list.result} />
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <TextField
              select
              size="small"
              label="Active"
              value={activeOnly}
              onChange={(e) => setActiveOnly(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="true">Active only</MenuItem>
              <MenuItem value="false">Inactive only</MenuItem>
            </TextField>
          </Paper>

          <Box
            data-freshness={list.freshness}
            sx={{
              mb: 1,
              fontSize: 12,
              color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
            }}
          >
            {list.freshness === "live" && plural(list.data?.count ?? rows.length, "curator")}
            {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
            {list.freshness === "empty" &&
              (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
          </Box>

          <Paper variant="outlined">
            {list.loading && rows.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Skeleton height={28} />
              </Box>
            ) : rows.length === 0 ? (
              <Box sx={{ p: 3 }} data-state="empty">
                <Typography variant="body2" color="text.secondary">
                  {list.freshness === "empty" && list.result?.kind === "unavailable"
                    ? describe(list.result)
                    : activeOnly
                      ? "No curators match this filter."
                      : "No curators have registered yet."}
                </Typography>
              </Box>
            ) : (
              <Table size="small" data-state="rows">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Curator</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Domain</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Fee</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Deal types</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Active</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((curator) => (
                    <Fragment key={curator.curator_id}>
                      <TableRow hover data-row="curator">
                        <TableCell>
                          <Box sx={{ fontSize: 13 }}>{curator.name || curator.curator_id}</Box>
                          <Box
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 11,
                              color: palette.textSecondary,
                            }}
                          >
                            {curator.curator_id}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{curator.domain || "—"}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {curator.type.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{fee(curator.fee)}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                          {curator.supported_deal_types.length === 0
                            ? "—"
                            : curator.supported_deal_types.map((t) => t.replace(/_/g, " ")).join(", ")}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={curator.is_active ? "active" : "inactive"} />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() =>
                              setOpenCurator((current) =>
                                current === curator.curator_id ? undefined : curator.curator_id,
                              )
                            }
                            aria-expanded={openCurator === curator.curator_id}
                          >
                            {openCurator === curator.curator_id ? "Hide details" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {openCurator === curator.curator_id && (
                        <TableRow>
                          <TableCell colSpan={7} sx={{ backgroundColor: palette.ground }}>
                            <Detail curatorId={curator.curator_id} />
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
      )}
    </section>
  );
}
