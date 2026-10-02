import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import {
  checkAvails,
  type Avails,
  type AvailsCheckResult,
  type AvailsQuery,
  type OpenDirectAvails,
} from "../api/endpoints";
import { describe } from "../api/errors";
import { FormRow } from "../components/WriteForm";
import { GatedNotice } from "../components/GatedNotice";
import { TipField } from "../components/TipField";
import { stamp } from "../lib/time";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { ProductMultiPicker, ProductPicker } from "./pickers";

/** `asOf` is epoch ms; `stamp` takes ISO. Same round-trip as the rest of the Catalog. */
function asOfStamp(at: number): string {
  return stamp(new Date(at).toISOString());
}

type Row = Avails | OpenDirectAvails;

/** The forecast shape carries a CPM; the OpenDirect one carries a price and a status. */
function isForecast(row: Row): row is Avails {
  return "availableImpressions" in row;
}

function rowsOf(result: AvailsCheckResult): Row[] {
  const wrapped = (result as { avails?: unknown }).avails;
  return Array.isArray(wrapped) ? (wrapped as Row[]) : [result as Row];
}

type Mode = "one" | "many";

/** An optional JSON field: blank is "not sent", anything else must parse to the right kind. */
function parseJson(text: string, kind: "object" | "array"): { value?: unknown; error?: string } {
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    const right =
      kind === "array"
        ? Array.isArray(value)
        : typeof value === "object" && value !== null && !Array.isArray(value);
    return right
      ? { value }
      : {
          error: kind === "array" ? "must be a JSON array" : "must be a JSON object",
        };
  } catch {
    return { error: "is not valid JSON" };
  }
}

function numberOrUndefined(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export function AvailsCheck() {
  const [mode, setMode] = useState<Mode>("one");
  const [productId, setProductId] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [accountId, setAccountId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [impressions, setImpressions] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("");
  const [targeting, setTargeting] = useState("");
  const [productTargeting, setProductTargeting] = useState("");
  const [grouping, setGrouping] = useState("");
  const [fields, setFields] = useState("");
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState<AvailsQuery | undefined>(undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(undefined);
    if (!startDate || !endDate) return;

    if (mode === "one") {
      if (!productId.trim()) return;
      const target = parseJson(targeting, "object");
      if (target.error) return setProblem(`Targeting ${target.error}.`);
      const requested = numberOrUndefined(impressions);
      const money = numberOrUndefined(budget);
      setSubmitted({
        productid: productId.trim(),
        startdate: startDate,
        enddate: endDate,
        ...(requested !== undefined ? { requestedImpressions: requested } : {}),
        ...(money !== undefined ? { budget: money } : {}),
        ...(target.value ? { targeting: target.value as Record<string, unknown> } : {}),
      });
      return;
    }

    if (productIds.length === 0 || !accountId.trim() || !brandId.trim()) return;
    const parsed = {
      targeting: parseJson(targeting, "array"),
      producttargeting: parseJson(productTargeting, "array"),
      grouping: parseJson(grouping, "array"),
      availabilityfields: parseJson(fields, "array"),
    };
    for (const [name, p] of Object.entries(parsed)) {
      if (p.error) return setProblem(`${name} ${p.error}.`);
    }
    setSubmitted({
      productids: productIds,
      accountid: accountId.trim(),
      advertiserbrandid: brandId.trim(),
      startdate: startDate,
      enddate: endDate,
      ...(currency.trim() ? { currency: currency.trim() } : {}),
      ...(parsed.targeting.value
        ? { targeting: parsed.targeting.value as Record<string, unknown>[] }
        : {}),
      ...(parsed.producttargeting.value
        ? { producttargeting: parsed.producttargeting.value as unknown[] }
        : {}),
      ...(parsed.grouping.value ? { grouping: parsed.grouping.value as unknown[] } : {}),
      ...(parsed.availabilityfields.value
        ? { availabilityfields: parsed.availabilityfields.value as unknown[] }
        : {}),
    });
  }

  const json = (
    label: string,
    hint: string,
    value: string,
    set: (v: string) => void,
    kind: "object" | "array",
  ) => (
    <TipField
      hint={`${hint} Optional; JSON ${kind === "array" ? "array" : "object"}.`}
      size="small"
      label={label}
      multiline
      minRows={2}
      value={value}
      onChange={(e) => set(e.target.value)}
      slotProps={{
        htmlInput: {
          spellCheck: false,
          style: { fontFamily: "monospace", fontSize: 12 },
        },
      }}
      sx={{ minWidth: 260, flex: 1 }}
    />
  );

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-block="avails">
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, next: Mode | null) => next && setMode(next)}
            aria-label="Availability request"
          >
            <ToggleButton value="one">One product</ToggleButton>
            <ToggleButton value="many">Several products</ToggleButton>
          </ToggleButtonGroup>
          <FormRow>
            {mode === "one" ? (
              <ProductPicker
                value={productId}
                onChange={setProductId}
                hint="The product to use. Pick one, or type or paste an id. Required."
              />
            ) : (
              <>
                <ProductMultiPicker
                  value={productIds}
                  onChange={setProductIds}
                  hint="The products to check together. Pick as many as you need, or type or paste ids. Required."
                  sx={{ minWidth: 320, flex: 1 }}
                />
                <TipField
                  hint="The buyer account the availability is asked for. Required."
                  size="small"
                  label="Account id"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                />
                <TipField
                  hint="The advertiser brand the availability is asked for. Required."
                  size="small"
                  label="Advertiser brand id"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                />
              </>
            )}
            <TipField
              hint="First day of the flight to check. Required; the check will not run without it."
              size="small"
              label="Start"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <TipField
              hint="Last day of the flight to check. Required; the check will not run without it."
              size="small"
              label="End"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {mode === "one" ? (
              <>
                <TipField
                  hint="Optional impressions the buyer wants. The agent sizes the forecast and cost to this figure."
                  size="small"
                  label="Impressions"
                  type="number"
                  value={impressions}
                  onChange={(e) => setImpressions(e.target.value)}
                  sx={{ width: 140 }}
                />
                <TipField
                  hint="Optional budget, as a plain number. The agent may size the forecast to what it buys."
                  size="small"
                  label="Budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  sx={{ width: 140 }}
                />
              </>
            ) : (
              <TipField
                hint="Optional currency code for the prices, for example USD."
                size="small"
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                sx={{ width: 110 }}
              />
            )}
            <Button size="small" onClick={() => setMore(!more)} aria-expanded={more}>
              {more ? "Fewer options" : "More options"}
            </Button>
            <Button type="submit" variant="outlined" size="small" data-action="check-avails">
              Check avails
            </Button>
          </FormRow>
          <Collapse in={more} unmountOnExit={false}>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              {mode === "one" ? (
                json(
                  "Targeting",
                  "Targeting the forecast should respect.",
                  targeting,
                  setTargeting,
                  "object",
                )
              ) : (
                <>
                  {json(
                    "Targeting",
                    "Targeting criteria for the check.",
                    targeting,
                    setTargeting,
                    "array",
                  )}
                  {json(
                    "Product targeting",
                    "Per-product targeting dimensions, as OpenDirect ProductTargeting records.",
                    productTargeting,
                    setProductTargeting,
                    "array",
                  )}
                  {json(
                    "Grouping",
                    "How the answer is grouped, as ProductTargeting records.",
                    grouping,
                    setGrouping,
                    "array",
                  )}
                  {json(
                    "Availability fields",
                    "Which availability fields to return, as ProductTargeting records.",
                    fields,
                    setFields,
                    "array",
                  )}
                </>
              )}
            </Stack>
          </Collapse>
          {problem && (
            <Typography variant="body2" sx={{ color: palette.error }} data-state="avails-input">
              {problem}
            </Typography>
          )}
        </Stack>
      </Box>
      {submitted !== undefined && <AvailsResults query={submitted} />}
    </Paper>
  );
}

function AvailsResults({ query }: { query: AvailsQuery }) {
  const results = useResource(`avails:${JSON.stringify(query)}`, (c, signal) =>
    checkAvails(c, query, signal),
  );
  const rows = results.data ? rowsOf(results.data) : [];
  const forecasts = rows.filter(isForecast);
  const priced = rows.filter((r): r is OpenDirectAvails => !isForecast(r));

  if (results.freshness === "blocked") {
    return <GatedNotice what="Availability" result={results.result} />;
  }

  return (
    <Box sx={{ mt: 2 }} data-block="avails-results">
      <Box
        data-freshness={results.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: results.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {results.freshness === "live" &&
          results.asOf !== undefined &&
          `as of ${asOfStamp(results.asOf)}`}
        {results.freshness === "stale" && "couldn't refresh — showing the last avails received"}
        {results.freshness === "empty" &&
          (results.loading ? "checking…" : results.result ? describe(results.result) : "")}
      </Box>

      {results.loading && rows.length === 0 ? (
        <Skeleton height={28} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-avails">
          {results.result ? describe(results.result) : "No availability returned."}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {forecasts.length > 0 && (
            <Table size="small" data-block="avails-forecast">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Available impressions</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Guaranteed impressions</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Estimated CPM</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Total cost</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Delivery confidence</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Available targeting</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {forecasts.map((row) => (
                  <TableRow key={row.productid} hover data-row="avail">
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                      {row.productid}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {row.availableImpressions.toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {row.guaranteedImpressions?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{row.estimatedCpm}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{row.totalCost}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {/* Omitted when the seller has no forecast source — never
                          shown as a zero, which would look measured. */}
                      {row.deliveryConfidence ?? "not provided"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {row.availableTargeting?.join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {priced.length > 0 && (
            <Table size="small" data-block="avails-priced">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Availability</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Flight</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {priced.map((row, i) => (
                  <TableRow key={`${row.productid}:${i}`} hover data-row="avail">
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                      {row.productid}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{row.accountid || "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {row.availability?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {row.price == null
                        ? "—"
                        : `${row.price}${row.currency ? ` ${row.currency}` : ""}`}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {row.availsstatus
                        ? [
                            row.availsstatus.status,
                            row.availsstatus.reason,
                            row.availsstatus.comment,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {row.startdate} – {row.enddate}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      )}
    </Box>
  );
}
