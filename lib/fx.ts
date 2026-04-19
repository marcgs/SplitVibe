/**
 * Foreign-exchange utilities. Rates are read from the cached `ExchangeRate`
 * table populated by the Frankfurter background refresh
 * (`POST /api/fx/refresh`).
 *
 * Lookups never call out to the network — if no cached rate exists for a
 * currency pair we return `null` so the caller can surface a clear error.
 */

import { db } from "@/lib/db";

/**
 * Returns the most recent cached exchange rate for `from → to`, or `null`
 * if none has been recorded yet. Same-currency lookups always return `1`.
 */
export async function getCachedRate(
  from: string,
  to: string
): Promise<number | null> {
  if (from === to) return 1;

  const rate = await db.exchangeRate.findFirst({
    where: { fromCcy: from, toCcy: to },
    orderBy: { recordedAt: "desc" },
    select: { rate: true },
  });

  return rate ? Number(rate.rate) : null;
}

/**
 * Convert `amount` from one currency to another using the latest cached rate.
 * Returns `null` if no rate is available.
 */
export async function convertAmount(
  amount: number,
  from: string,
  to: string
): Promise<number | null> {
  const rate = await getCachedRate(from, to);
  if (rate === null) return null;
  return amount * rate;
}

/**
 * Truncate a date to UTC start-of-day. Used to deduplicate daily FX
 * snapshots — multiple refreshes on the same day update a single row
 * via `upsert` on `(fromCcy, toCcy, recordedAt)`.
 */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
