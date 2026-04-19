import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateBalances } from "@/lib/balances";
import type { ExpenseData, SettlementData } from "@/lib/balances";
import { getCachedRate } from "@/lib/fx";
import { Prisma } from "@prisma/client";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { preferredCurrency: true },
  });
  const preferredCurrency = user?.preferredCurrency ?? "USD";

  const groups = await db.group.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      baseCurrency: true,
      expenses: {
        where: { deletedAt: null },
        select: {
          fxRate: true,
          payers: { select: { userId: true, amount: true } },
          splits: { select: { userId: true, amount: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const settlementsByGroup = new Map<
    string,
    { payerId: string; payeeId: string; amount: Prisma.Decimal }[]
  >();
  if (groups.length > 0) {
    const allSettlements = await db.settlement.findMany({
      where: {
        groupId: { in: groups.map((g) => g.id) },
        deletedAt: null,
      },
      select: { groupId: true, payerId: true, payeeId: true, amount: true },
    });
    for (const s of allSettlements) {
      const list = settlementsByGroup.get(s.groupId) ?? [];
      list.push({ payerId: s.payerId, payeeId: s.payeeId, amount: s.amount });
      settlementsByGroup.set(s.groupId, list);
    }
  }

  // For each group: compute the user's net balance in the group's base
  // currency, then convert to the user's preferred display currency.
  type Row = {
    id: string;
    name: string;
    baseCurrency: string;
    baseAmount: number;
    convertedAmount: number | null;
  };

  const rows: Row[] = [];
  let totalConverted = 0;
  let anyMissingRate = false;

  for (const group of groups) {
    const expenseData: ExpenseData[] = group.expenses.map((e) => {
      const rate = e.fxRate ? Number(e.fxRate) : 1;
      return {
        payers: e.payers.map((p) => ({
          userId: p.userId,
          amount: Number(p.amount) * rate,
        })),
        splits: e.splits.map((s) => ({
          userId: s.userId,
          amount: Number(s.amount) * rate,
        })),
      };
    });
    const settlementData: SettlementData[] = (
      settlementsByGroup.get(group.id) ?? []
    ).map((s) => ({
      payerId: s.payerId,
      payeeId: s.payeeId,
      amount: Number(s.amount),
    }));

    const balances = calculateBalances(expenseData, settlementData);
    const baseAmount = balances.get(userId) ?? 0;

    const fx = await getCachedRate(group.baseCurrency, preferredCurrency);
    if (fx === null) {
      anyMissingRate = true;
      rows.push({
        id: group.id,
        name: group.name,
        baseCurrency: group.baseCurrency,
        baseAmount,
        convertedAmount: null,
      });
    } else {
      const converted = baseAmount * fx;
      totalConverted += converted;
      rows.push({
        id: group.id,
        name: group.name,
        baseCurrency: group.baseCurrency,
        baseAmount,
        convertedAmount: converted,
      });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <Link
            href="/groups"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Groups →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your balances
          </h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Display currency: {preferredCurrency}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You&apos;re not in any groups yet.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/groups/${row.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  <div>
                    <div className="text-sm font-medium">{row.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {row.baseAmount.toFixed(2)} {row.baseCurrency}
                      {row.baseCurrency !== preferredCurrency && " (group)"}
                    </div>
                  </div>
                  <div
                    className={
                      row.convertedAmount === null
                        ? "text-sm text-amber-600 dark:text-amber-400"
                        : row.convertedAmount >= 0
                          ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-sm font-semibold text-red-600 dark:text-red-400"
                    }
                  >
                    {row.convertedAmount === null
                      ? `No FX rate ${row.baseCurrency} → ${preferredCurrency}`
                      : `${row.convertedAmount.toFixed(2)} ${preferredCurrency}`}
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Total ({preferredCurrency})
                </span>
                <span
                  className={
                    totalConverted >= 0
                      ? "text-base font-semibold text-emerald-600 dark:text-emerald-400"
                      : "text-base font-semibold text-red-600 dark:text-red-400"
                  }
                >
                  {totalConverted.toFixed(2)} {preferredCurrency}
                </span>
              </div>
              {anyMissingRate && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Some groups are missing an FX rate to {preferredCurrency}{" "}
                  and were excluded from the total.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
