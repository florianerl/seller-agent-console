import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { publicPackages } from "../api/endpoints";
import { describe } from "../api/errors";
import { DataPanel } from "../components/DataPanel";
import { stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * What a caller with no key is shown for the same packages: a price band, no
 * exact or floor price. Fetched without the key, not derived from the table
 * above, so it is what the agent actually serves and not our guess at it.
 */
export function PublicPackages() {
  const list = useResource("packages-public", publicPackages, {
    refreshInterval: CADENCE.rateCard,
  });
  const rows = list.data?.packages ?? [];

  return (
    <section data-block="public-packages" style={{ marginTop: 24 }}>
      <Typography variant="h4" sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>
        Without a key
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        What a caller with no API key sees for these packages.
      </Typography>
      {list.loading && rows.length === 0 ? (
        <Skeleton height={60} />
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }} data-state="no-public-packages">
          <Typography variant="body2" color="text.secondary">
            {list.result && list.result.kind !== "ok"
              ? describe(list.result)
              : "No packages."}
          </Typography>
        </Paper>
      ) : (
        <DataPanel>
          <Table size="small" data-block="public-package-table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Package</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Rate</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Price range</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((pkg) => (
                <TableRow key={pkg.package_id} hover data-row="public-package">
                  <TableCell sx={{ fontSize: 13 }}>
                    {pkg.name || pkg.package_id}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {pkg.rate_type ?? "—"}
                  </TableCell>
                  {/* Null means the agent sent no band, not a free package. */}
                  <TableCell sx={{ fontSize: 12 }}>
                    {pkg.price_range ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataPanel>
      )}
      {list.freshness === "live" && list.asOf !== undefined && (
        <Typography
          variant="caption"
          component="p"
          data-freshness="live"
          sx={{ mt: 0.5, color: palette.textSecondary }}
        >
          as of {stamp(new Date(list.asOf).toISOString())}
        </Typography>
      )}
      {list.freshness === "stale" && (
        <Typography
          variant="caption"
          component="p"
          data-freshness="stale"
          sx={{ mt: 0.5, color: palette.warningText }}
        >
          couldn't refresh — showing the last view received
        </Typography>
      )}
    </section>
  );
}
