import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { putRateCard, rateCard, type RateCardEntry } from "../api/endpoints";
import { describe } from "../api/errors";
import { INVENTORY_TYPES, words } from "../api/vocabulary";
import { ConfirmButton, WRITES_OFF_HINT } from "../components/ConfirmButton";
import { DataPanel } from "../components/DataPanel";
import { ScreenSection } from "../components/ScreenSection";
import { EnumSelect } from "../components/EnumSelect";
import { Hint } from "../components/Hint";
import { TipField } from "../components/TipField";
import { useCredential } from "../credentials/context";
import { plain, priceProblem } from "../lib/money";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

type PutEntry = Parameters<typeof putRateCard>[1][number];

/**
 * One row of the card while it is being edited. `origDate` is the date as the
 * agent sent it: an untouched date goes back byte for byte rather than as the
 * `YYYY-MM-DD` the date input shows, so opening the editor and saving changes
 * nothing it was not asked to.
 */
type Row = {
  key: string;
  /** On the card as last read; its inventory type is fixed. A new row picks one. */
  existing: boolean;
  inventory_type: string;
  base_cpm: string;
  effective_date: string;
  origDate: string | null | undefined;
  notes: string;
  currency: string;
};

/** An entry as the PUT takes it: unset optionals left out rather than sent as null. */
function toPut(entry: RateCardEntry, cpm: number): PutEntry {
  return {
    inventory_type: entry.inventory_type,
    base_cpm: cpm,
    currency: entry.currency,
    ...(entry.effective_date ? { effective_date: entry.effective_date } : {}),
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
}

function fromRow(row: Row): PutEntry {
  const date =
    row.origDate && row.effective_date === row.origDate.slice(0, 10)
      ? row.origDate
      : row.effective_date;
  return {
    inventory_type: row.inventory_type,
    base_cpm: Number(row.base_cpm),
    currency: row.currency,
    ...(date ? { effective_date: date } : {}),
    ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
  };
}

function toRow(entry: RateCardEntry): Row {
  return {
    key: entry.inventory_type,
    existing: true,
    inventory_type: entry.inventory_type,
    base_cpm: entry.base_cpm == null ? "" : String(entry.base_cpm),
    effective_date: entry.effective_date?.slice(0, 10) ?? "",
    origDate: entry.effective_date,
    notes: entry.notes ?? "",
    currency: entry.currency,
  };
}

const cellSx = { fontSize: 12 } as const;

/**
 * The rate card, edited where it is read. The PUT replaces the whole card, so
 * editing is one mode for the whole table with one Save, rather than a row at a
 * time that quietly re-sends every other row. That is also why a save is
 * refused while the card on screen is not a live read — the rows sent back
 * would be whatever this screen last saw, and the card has no version to catch
 * a concurrent edit with.
 */
export function RateCardTable() {
  const { writesEnabled } = useCredential();
  const card = useResource("rate-card", rateCard, {
    refreshInterval: CADENCE.rateCard,
  });
  // Undefined while viewing; the whole card as drafted while editing.
  const [rows, setRows] = useState<Row[] | undefined>();
  const [added, setAdded] = useState(0);

  const put = useMutation<{ entries: PutEntry[] }, unknown>(
    (c, args) => putRateCard(c, args.entries),
    { invalidates: ["rate-card"] },
  );

  if (card.loading && !card.data) {
    return (
      <ScreenSection title="Rate card">
        <Skeleton height={60} />
      </ScreenSection>
    );
  }
  if (!card.data) {
    return (
      <ScreenSection title="Rate card">
        <Paper variant="outlined" sx={{ p: 3 }} data-state="no-rate-card">
          <Typography variant="body2" color="text.secondary">
            {card.result ? describe(card.result) : "No rate card."}
          </Typography>
        </Paper>
      </ScreenSection>
    );
  }

  const configured = card.data.source === "stored";
  const entries = card.data.entries;
  const blocked = !writesEnabled;
  const currency = entries[0]?.currency ?? "USD";
  const unused = INVENTORY_TYPES.filter(
    (o) => !rows?.some((r) => r.inventory_type === o.value),
  );

  const notLive =
    card.freshness !== "live"
      ? "The card on screen could not be refreshed. Saving now would send back rows that may be out of date."
      : undefined;

  /** Why the drafted card cannot be sent, or that it is not a change. */
  function problem(draft: Row[]): string | undefined {
    if (notLive) return notLive;
    for (const r of draft) {
      if (!r.inventory_type)
        return "Choose an inventory type for every new row.";
      const bad = priceProblem(r.base_cpm, { positive: true });
      if (bad) return `${words(r.inventory_type) || "A row"}: ${bad}`;
    }
    const sent = JSON.stringify(draft.map(fromRow));
    const read = JSON.stringify(entries.map((e) => toPut(e, e.base_cpm ?? 0)));
    return sent === read ? "Nothing has changed." : undefined;
  }

  /** What every save says. */
  function replaceNote(sent: number) {
    return (
      <>
        This replaces the whole stored card with the {plural(sent, "row")} now
        on screen. A rate someone else changed since this screen loaded it is
        overwritten. If the call fails, the previous card stays; after an
        unclear failure it may or may not have been replaced, so reload before
        retrying.
        {!configured && (
          <>
            {" "}
            No card is stored yet: the other rows are the agent's built-in
            fallback values, and saving stores them as this publisher's pricing.
          </>
        )}
      </>
    );
  }

  function open() {
    put.reset();
    setRows(entries.map(toRow));
  }

  function change(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current?.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    const key = `\u0000new${added}`;
    setAdded(added + 1);
    setRows((current) => [
      ...(current ?? []),
      {
        key,
        existing: false,
        inventory_type: unused[0]?.value ?? "",
        base_cpm: "",
        effective_date: "",
        origDate: undefined,
        notes: "",
        currency,
      },
    ]);
  }

  async function save(draft: Row[]) {
    const result = await put.run({ entries: draft.map(fromRow) });
    if (result.kind === "ok") setRows(undefined);
  }

  const saveProblem = rows ? problem(rows) : undefined;

  const actions = (
    <Stack direction="row" spacing={1} justifyContent="flex-end">
      {rows ? (
        <>
          <Button
            size="small"
            onClick={() => setRows(undefined)}
            disabled={put.pending}
          >
            Cancel
          </Button>
          <ConfirmButton
            label="Save"
            title="Replace the rate card?"
            action="save-rate"
            variant="contained"
            blocked={blocked}
            pending={put.pending}
            disabled={saveProblem !== undefined}
            hint={saveProblem}
            onConfirm={() => void save(rows)}
            consequence={replaceNote(rows.length)}
          />
        </>
      ) : (
        <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
          <Button
            size="small"
            variant="outlined"
            data-action="edit-rate"
            disabled={blocked}
            onClick={open}
          >
            Edit
          </Button>
        </Hint>
      )}
    </Stack>
  );

  return (
    <ScreenSection title="Rate card" actions={actions}>
      {/* The agent invents a fallback card when none has been configured and
          reports it in the same shape as a real one. Showing those numbers as
          this publisher's pricing would be a fabrication with a plausible
          face, so the distinction is the first thing on the section. */}
      {!configured && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ mb: 1 }}
          data-note="rate-card-defaults"
        >
          No rate card has been configured. These are the agent's built-in
          fallback values, not this publisher's pricing.
        </Alert>
      )}
      <DataPanel>
        <Table
          size="small"
          data-block="rate-card"
          data-source={card.data.source}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Inventory type</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Base CPM</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Effective</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows
              ? rows.map((row) => (
                  <TableRow key={row.key} data-row="rate" data-editing="true">
                    <TableCell sx={{ fontSize: 13 }}>
                      {row.existing ? (
                        row.inventory_type
                      ) : (
                        // Unvalidated upstream, so a typo would be stored and
                        // then match no product. Only the documented types not
                        // already on the card are offered.
                        <EnumSelect<string>
                          hint="Which inventory type this rate applies to. Types already on the card are left out."
                          label="Inventory type"
                          value={row.inventory_type}
                          options={INVENTORY_TYPES.filter(
                            (o) =>
                              o.value === row.inventory_type ||
                              !rows.some((r) => r.inventory_type === o.value),
                          )}
                          onChange={(v) =>
                            change(row.key, { inventory_type: v })
                          }
                          sx={{ minWidth: 150 }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TipField
                        hint="Base CPM as a plain number in dollars per thousand impressions. Must be above zero."
                        size="small"
                        value={row.base_cpm}
                        onChange={(e) =>
                          change(row.key, { base_cpm: e.target.value })
                        }
                        placeholder="CPM"
                        slotProps={{
                          htmlInput: {
                            "aria-label": "Base CPM",
                            inputMode: "decimal",
                          },
                        }}
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TipField
                        hint="Optional. The day this rate takes effect."
                        size="small"
                        type="date"
                        value={row.effective_date}
                        onChange={(e) =>
                          change(row.key, { effective_date: e.target.value })
                        }
                        slotProps={{
                          htmlInput: { "aria-label": "Effective date" },
                        }}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TipField
                        hint="Optional note stored with the rate."
                        size="small"
                        value={row.notes}
                        onChange={(e) =>
                          change(row.key, { notes: e.target.value })
                        }
                        placeholder="Notes"
                        slotProps={{ htmlInput: { "aria-label": "Notes" } }}
                        sx={{ minWidth: 160 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {/* Drops the row from the draft only. Nothing is sent
                          until Save, which says what the whole card becomes. */}
                      <Button
                        size="small"
                        color="error"
                        data-action="remove-rate"
                        disabled={put.pending}
                        onClick={() =>
                          setRows(rows.filter((r) => r.key !== row.key))
                        }
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : entries.map((entry) => (
                  <TableRow key={entry.inventory_type} hover data-row="rate">
                    <TableCell sx={{ fontSize: 13 }}>
                      {entry.inventory_type}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {plain(entry.base_cpm, entry.currency)}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: palette.textSecondary }}>
                      {stamp(entry.effective_date)}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: palette.textSecondary }}>
                      {entry.notes ?? "—"}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
            {(rows ?? entries).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  sx={{ ...cellSx, color: palette.textSecondary }}
                >
                  The card has no rates.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataPanel>
      {put.last && put.last.kind !== "ok" && (
        <Typography
          variant="body2"
          sx={{ mt: 1, color: palette.error }}
          data-state="write-failed"
        >
          {describe(put.last)}
        </Typography>
      )}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 0.5 }}
      >
        <Typography
          variant="body2"
          sx={{ fontSize: 12, color: palette.textSecondary }}
        >
          {configured ? "Set by an operator" : "Agent defaults"} · updated{" "}
          {stamp(card.data.updated_at)}
        </Typography>
        {rows && unused.length > 0 && (
          <Button
            size="small"
            data-action="new-rate"
            disabled={put.pending}
            onClick={addRow}
          >
            Add rate
          </Button>
        )}
      </Stack>
    </ScreenSection>
  );
}
