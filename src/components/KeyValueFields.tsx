import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import type { KeyValueRow } from "../lib/key-values";
import { TipField } from "./TipField";

/**
 * Free-form `metadata` for a call whose OpenAPI schema types it as an open
 * object (order creation, an order transition). The agent stores it as sent
 * and shows it back on the order and its timeline, so it is where an
 * operator records what the fixed fields have no room for — an ad-server
 * order id, a ticket, who signed off. Strings only: the console does not
 * guess at JSON types, and nothing upstream reads these keys.
 */
export function KeyValueFields({
  rows,
  onChange,
  disabled,
  addLabel = "Add a detail",
  hint,
}: {
  rows: readonly KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  disabled?: boolean;
  addLabel?: string;
  hint: string;
}) {
  const set = (i: number, patch: Partial<KeyValueRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Box data-block="key-values">
      <Stack spacing={1}>
        {rows.map((r, i) => (
          <Stack direction="row" spacing={1} alignItems="center" key={i}>
            <TipField
              hint={hint}
              size="small"
              label="Name"
              value={r.key}
              onChange={(e) => set(i, { key: e.target.value })}
              disabled={disabled}
              sx={{ flex: "1 1 40%" }}
            />
            <TipField
              hint="The value stored under that name."
              size="small"
              label="Value"
              value={r.value}
              onChange={(e) => set(i, { value: e.target.value })}
              disabled={disabled}
              sx={{ flex: "1 1 60%" }}
            />
            <IconButton
              size="small"
              aria-label={`Remove ${r.key.trim() || "this detail"}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button
        size="small"
        onClick={() => onChange([...rows, { key: "", value: "" }])}
        disabled={disabled}
        sx={{ mt: rows.length ? 0.5 : 0 }}
        data-action="add-key-value"
      >
        {addLabel}
      </Button>
    </Box>
  );
}
