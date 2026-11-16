import { dateOrStamp } from "../lib/time";

/** Formatting shared by the OpenProposal views; kept out of component modules so fast refresh works. */

export function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const figure = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${figure}` : figure;
}

/** Where the proposal's own window ends and the buyer's flight begins are easy to conflate. */
export function span(from: string | null | undefined, to: string | null | undefined): string {
  return from || to ? `${dateOrStamp(from)} – ${dateOrStamp(to)}` : "—";
}
