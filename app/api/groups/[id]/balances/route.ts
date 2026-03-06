import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateBalances, simplifyDebts } from "@/lib/balances";
import type { ExpenseData, SettlementData } from "@/lib/balances";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: groupId } = await params;

  // Check membership
  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: session.user.id },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all non-deleted expenses with payers and splits
  const expenses = await db.expense.findMany({
    where: { groupId, deletedAt: null },
    include: {
      payers: { select: { userId: true, amount: true } },
      splits: { select: { userId: true, amount: true } },
    },
  });

  // Fetch all non-deleted settlements
  const settlements = await db.settlement.findMany({
    where: { groupId, deletedAt: null },
    select: { payerId: true, payeeId: true, amount: true },
  });

  // Convert Prisma Decimal to number for pure functions
  const expenseData: ExpenseData[] = expenses.map((e) => ({
    payers: e.payers.map((p) => ({
      userId: p.userId,
      amount: Number(p.amount),
    })),
    splits: e.splits.map((s) => ({
      userId: s.userId,
      amount: Number(s.amount),
    })),
  }));

  const settlementData: SettlementData[] = settlements.map((s) => ({
    payerId: s.payerId,
    payeeId: s.payeeId,
    amount: Number(s.amount),
  }));

  const balancesMap = calculateBalances(expenseData, settlementData);
  const simplifiedDebts = simplifyDebts(balancesMap);

  // Convert Map to array for JSON serialization
  const balances = Array.from(balancesMap.entries()).map(([userId, amount]) => ({
    userId,
    amount,
  }));

  return NextResponse.json({ balances, simplifiedDebts });
}
