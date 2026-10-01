/** A plain amount in a currency's major unit, as the pricing routes report it. */
export function plain(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);
}

/**
 * Why a typed price is not one to send, or undefined when it is. `positive`
 * for the rate card, which refuses a CPM at or below zero (422).
 */
export function priceProblem(raw: string, { positive = false } = {}): string | undefined {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Enter a plain number, for example 12.";
  if (positive ? n <= 0 : n < 0) {
    return positive ? "The agent refuses a price at or below zero." : "A price cannot be negative.";
  }
  return undefined;
}
