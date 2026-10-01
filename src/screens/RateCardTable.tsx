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

type Draft = { inventory_type: string; base_cpm: string; effective_date: string; notes: string };

/** What the add row opens with. */
const NEW_ROW = "\u0000new";

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

function fromDraft(draft: Draft, currency: string): PutEntry {
  return {
    inventory_type: draft.inventory_type,
    base_cpm: Number(draft.base_cpm),
    currency,
    ...(draft.effective_date ? { effective_date: draft.effective_date } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
}

const cellSx = { fontSize: 12 } as const;

/**
 * The rate card, edited where it is read. The PUT replaces the whole card, so
 * every save sends every row: the one edited as typed, the rest exactly as
 * last read. That is why a save is refused while the card on screen is not a
 * live read — the rows sent back would be whatever this screen last saw, and
 * the card has no version to catch a concurrent edit with.
 */
export function RateCardTable() {
  const { writesEnabled } = useCredential();
  const card = useResource("rate-card", rateCard, { refreshInterval: CADENCE.rateCard });
  // The inventory type whose row is open for editing, NEW_ROW for the add row.
  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState<Draft>({
    inventory_type: "",
    base_cpm: "",
    effective_date: "",
    notes: "",
  });

  const put = useMutation<{ entries: PutEntry[] }, unknown>(
    (c, args) => putRateCard(c, args.entries),
    { invalidates: ["rate-card"] },
  );

  if (card.loading && !card.data) return <Skeleton height={60} />;
  if (!card.data) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }} data-state="no-rate-card">
        <Typography variant="body2" color="text.secondary">
          {card.result ? describe(card.result) : "No rate card."}
        </Typography>
      </Paper>
    );
  }

  const configured = card.data.source === "stored";
  const entries = card.data.entries;
  const blocked = !writesEnabled;
  const currency = entries[0]?.currency ?? "USD";
  const unused = INVENTORY_TYPES.filter(
    (o) => !entries.some((e) => e.inventory_type === o.value),
  );

  /**
   * The card to send: every row as last read, with `except` swapped for
   * `replacement` in place (or dropped, without one). A row the agent sent
   * without a CPM cannot be sent back — the PUT requires one above zero — and
   * rather than invent a number for it, there is no card to send.
   */
  function rest(except?: string, replacement?: PutEntry): PutEntry[] | undefined {
    const out: PutEntry[] = [];
    for (const e of entries) {
      if (e.inventory_type === except) {
        if (replacement) out.push(replacement);
        continue;
      }
      if (e.base_cpm == null || e.base_cpm <= 0) return undefined;
      out.push(toPut(e, e.base_cpm));
    }
    return out;
  }

  const notLive =
    card.freshness !== "live"
      ? "The card on screen could not be refreshed. Saving now would send back rows that may be out of date."
      : undefined;

  function unsendable(except?: string): string | undefined {
    return rest(except)
      ? undefined
      : "Another row has no CPM, and the agent refuses a card with one. Fix it first.";
  }

  function removeProblem(entry: RateCardEntry): string | undefined {
    return notLive ?? unsendable(entry.inventory_type);
  }

  /** What every save says, whichever row it came from. */
  function replaceNote(sent: number) {
    return (
      <>
        This replaces the whole stored card with the {plural(sent, "row")} now on
        screen. A rate someone else changed since this screen loaded it is
        overwritten. If the call fails, the previous card stays; after an unclear
        failure it may or may not have been replaced, so reload before retrying.
        {!configured && (
          <>
            {" "}
            No card is stored yet: the other rows are the agent's built-in fallback
            values, and saving stores them as this publisher's pricing.
          </>
        )}
      </>
    );
  }

  function open(entry: RateCardEntry | undefined) {
    put.reset();
    setEditing(entry?.inventory_type ?? NEW_ROW);
    setDraft(
      entry
        ? {
            inventory_type: entry.inventory_type,
            base_cpm: entry.base_cpm == null ? "" : String(entry.base_cpm),
            effective_date: entry.effective_date?.slice(0, 10) ?? "",
            notes: entry.notes ?? "",
          }
        : {
            inventory_type: unused[0]?.value ?? "",
            base_cpm: "",
            effective_date: "",
            notes: "",
          },
    );
  }

  async function send(next: PutEntry[]) {
    const result = await put.run({ entries: next });
    if (result.kind === "ok") setEditing(undefined);
  }

  const editFields = (
    <>
      <TableCell sx={cellSx}>
        <TipField
          hint="Base CPM as a plain number in dollars per thousand impressions. Must be above zero."
          size="small"
          value={draft.base_cpm}
          onChange={(e) => setDraft({ ...draft, base_cpm: e.target.value })}
          placeholder="CPM"
          slotProps={{ htmlInput: { "aria-label": "Base CPM", inputMode: "decimal" } }}
          sx={{ width: 110 }}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <TipField
          hint="Optional. The day this rate takes effect."
          size="small"
          type="date"
          value={draft.effective_date}
          onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })}
          slotProps={{ htmlInput: { "aria-label": "Effective date" } }}
          sx={{ width: 160 }}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <TipField
          hint="Optional note stored with the rate."
          size="small"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Notes"
          slotProps={{ htmlInput: { "aria-label": "Notes" } }}
          sx={{ minWidth: 160 }}
        />
      </TableCell>
    </>
  );

  const editActions = (save: { label: string; action: string; title: string; next: PutEntry[] | undefined; except?: string }) => {
    const problem =
      notLive ??
      unsendable(save.except) ??
      priceProblem(draft.base_cpm, { positive: true }) ??
      (draft.inventory_type ? undefined : "Choose an inventory type.");
    return (
      <TableCell align="right">
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <ConfirmButton
            label={save.label}
            title={save.title}
            action={save.action}
            variant="contained"
            blocked={blocked}
            pending={put.pending}
            disabled={problem !== undefined}
            hint={problem}
            onConfirm={() => save.next && void send(save.next)}
            consequence={replaceNote(save.next?.length ?? 0)}
          />
          <Button size="small" onClick={() => setEditing(undefined)} disabled={put.pending}>
            Cancel
          </Button>
        </Stack>
      </TableCell>
    );
  };

  return (
    <>
      {/* The agent invents a fallback card when none has been configured and
          reports it in the same shape as a real one. Showing those numbers as
          this publisher's pricing would be a fabrication with a plausible
          face, so the distinction is the first thing on the section. */}
      {!configured && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1 }} data-note="rate-card-defaults">
          No rate card has been configured. These are the agent's built-in
          fallback values, not this publisher's pricing.
        </Alert>
      )}
      <DataPanel>
        <Table size="small" data-block="rate-card" data-source={card.data.source}>
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
            {entries.map((entry) =>
              editing === entry.inventory_type ? (
                <TableRow key={entry.inventory_type} data-row="rate" data-editing="true">
                  <TableCell sx={{ fontSize: 13 }}>{entry.inventory_type}</TableCell>
                  {editFields}
                  {editActions({
                    label: "Save",
                    action: "save-rate",
                    title: `Replace the rate card with the new ${entry.inventory_type} rate?`,
                    except: entry.inventory_type,
                    next: rest(entry.inventory_type, fromDraft(draft, entry.currency)),
                  })}
                </TableRow>
              ) : (
                <TableRow key={entry.inventory_type} hover data-row="rate">
                  <TableCell sx={{ fontSize: 13 }}>{entry.inventory_type}</TableCell>
                  <TableCell sx={cellSx}>{plain(entry.base_cpm, entry.currency)}</TableCell>
                  <TableCell sx={{ ...cellSx, color: palette.textSecondary }}>
                    {stamp(entry.effective_date)}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: palette.textSecondary }}>
                    {entry.notes ?? "—"}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
                        <Button
                          size="small"
                          data-action="edit-rate"
                          disabled={blocked || editing !== undefined}
                          onClick={() => open(entry)}
                        >
                          Edit
                        </Button>
                      </Hint>
                      <ConfirmButton
                        label="Remove"
                        variant="text"
                        color="error"
                        title={`Remove the ${entry.inventory_type} rate?`}
                        action="remove-rate"
                        blocked={blocked}
                        pending={put.pending}
                        disabled={editing !== undefined || removeProblem(entry) !== undefined}
                        hint={removeProblem(entry)}
                        onConfirm={() => {
                          const next = rest(entry.inventory_type);
                          if (next) void send(next);
                        }}
                        consequence={
                          <>
                            Products of this type go back to pricing from the
                            catalog. {replaceNote(entries.length - 1)}
                          </>
                        }
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              ),
            )}
            {editing === NEW_ROW && (
              <TableRow data-row="rate" data-editing="true">
                <TableCell sx={{ fontSize: 13 }}>
                  {/* Unvalidated upstream, so a typo would be stored and then
                      match no product. Only the documented types not already
                      on the card are offered. */}
                  <EnumSelect<string>
                    hint="Which inventory type this rate applies to. Types already on the card are left out."
                    label="Inventory type"
                    value={draft.inventory_type}
                    options={unused}
                    onChange={(v) => setDraft({ ...draft, inventory_type: v })}
                    sx={{ minWidth: 150 }}
                  />
                </TableCell>
                {editFields}
                {editActions({
                  label: "Add",
                  action: "add-rate",
                  title: `Add a ${words(draft.inventory_type) || "new"} rate to the card?`,
                  next: rest()?.concat(fromDraft(draft, currency)),
                })}
              </TableRow>
            )}
            {entries.length === 0 && editing !== NEW_ROW && (
              <TableRow>
                <TableCell colSpan={5} sx={{ ...cellSx, color: palette.textSecondary }}>
                  The card has no rates.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataPanel>
      {put.last && put.last.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
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
        <Typography variant="body2" sx={{ fontSize: 12, color: palette.textSecondary }}>
          {configured ? "Set by an operator" : "Agent defaults"} · updated{" "}
          {stamp(card.data.updated_at)}
        </Typography>
        {unused.length > 0 && (
          <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
            <Button
              size="small"
              data-action="new-rate"
              disabled={blocked || editing !== undefined}
              onClick={() => open(undefined)}
            >
              Add rate
            </Button>
          </Hint>
        )}
      </Stack>
    </>
  );
}
