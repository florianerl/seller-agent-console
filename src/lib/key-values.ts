export type KeyValueRow = { readonly key: string; readonly value: string };

/** The rows as the object the agent stores; blank keys are dropped, later duplicates win. */
export function rowsToRecord(rows: readonly KeyValueRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value.trim();
  }
  return out;
}
