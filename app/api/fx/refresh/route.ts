import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfUtcDay } from "@/lib/fx";

const FRANKFURTER_BASE = "https://api.frankfurter.app";

interface FrankfurterLatest {
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Refresh the cached FX rates from the Frankfurter API.
 *
 * Intended to be invoked once per day (e.g. by a cron / background
 * scheduler). Rates are upserted into `ExchangeRate` keyed on
 * (fromCcy, toCcy, recordedAt = startOfUtcDay), so calling the
 * endpoint multiple times the same day is idempotent.
 *
 * Authorization:
 *  - If `FX_REFRESH_SECRET` is set, the request must include
 *    `Authorization: Bearer <secret>`.
 *  - Otherwise any authenticated user may trigger a refresh.
 */
export async function POST(request: Request) {
  const secret = process.env.FX_REFRESH_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Collect every currency referenced in the system so we cache the rates
  // we will actually need at conversion time.
  const [groups, users, expenses] = await Promise.all([
    db.group.findMany({ select: { baseCurrency: true } }),
    db.user.findMany({ select: { preferredCurrency: true } }),
    db.expense.findMany({
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  const currencies = new Set<string>(["USD", "EUR"]);
  for (const g of groups) currencies.add(g.baseCurrency);
  for (const u of users) currencies.add(u.preferredCurrency);
  for (const e of expenses) currencies.add(e.currency);

  const recordedAt = startOfUtcDay(new Date());
  const all = Array.from(currencies);
  let upserted = 0;
  const failures: string[] = [];

  for (const from of all) {
    const targets = all.filter((c) => c !== from);
    if (targets.length === 0) continue;

    const url = `${FRANKFURTER_BASE}/latest?from=${encodeURIComponent(
      from
    )}&to=${targets.map(encodeURIComponent).join(",")}`;

    let payload: FrankfurterLatest;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        failures.push(`${from}: HTTP ${res.status}`);
        continue;
      }
      payload = (await res.json()) as FrankfurterLatest;
    } catch (err) {
      failures.push(`${from}: ${(err as Error).message}`);
      continue;
    }

    for (const [to, rate] of Object.entries(payload.rates ?? {})) {
      await db.exchangeRate.upsert({
        where: {
          fromCcy_toCcy_recordedAt: {
            fromCcy: from,
            toCcy: to,
            recordedAt,
          },
        },
        update: { rate, source: "frankfurter" },
        create: {
          fromCcy: from,
          toCcy: to,
          rate,
          source: "frankfurter",
          recordedAt,
        },
      });
      upserted++;
    }
  }

  return NextResponse.json({
    ok: true,
    recordedAt: recordedAt.toISOString(),
    currencies: all,
    upserted,
    failures,
  });
}
