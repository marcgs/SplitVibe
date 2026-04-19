import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const updateExpenseSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  paidBy: z.string().min(1).optional(),
  splitAmong: z.array(z.string().min(1)).min(1).optional(),
  date: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" })
    .optional(),
});

interface MemberWithUser {
  userId: string;
  user: { id: string; name: string | null; email: string };
}

function computeEqualSplits(
  amount: number,
  splitAmong: string[],
  groupMembers: MemberWithUser[]
): { userId: string; amount: number }[] {
  const amountCents = Math.round(amount * 100);
  const participantCount = splitAmong.length;
  const baseSplitCents = Math.floor(amountCents / participantCount);
  const remainderCents = amountCents - baseSplitCents * participantCount;

  const participantMembers = groupMembers
    .filter((m) => splitAmong.includes(m.userId))
    .sort((a, b) => {
      const nameA = (a.user.name ?? a.user.email).toLowerCase();
      const nameB = (b.user.name ?? b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  return participantMembers.map((member, index) => {
    const extraCent = index < remainderCents ? 1 : 0;
    const splitCents = baseSplitCents + extraCent;
    return { userId: member.userId, amount: splitCents / 100 };
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: expenseId } = await params;

  const existing = await db.expense.findUnique({
    where: { id: expenseId },
    include: {
      payers: { select: { userId: true } },
      splits: { select: { userId: true } },
    },
  });

  if (!existing || existing.deletedAt !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, amount, paidBy, splitAmong, date } = parsed.data;

  const splitsChanging =
    amount !== undefined || splitAmong !== undefined || paidBy !== undefined;

  let newSplits: { userId: string; amount: number }[] | null = null;
  let newPayer: { userId: string; amount: number } | null = null;

  if (splitsChanging) {
    const groupMembers = await db.groupMember.findMany({
      where: { groupId: existing.groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const memberUserIds = new Set(groupMembers.map((m) => m.userId));

    const effectiveAmount = amount ?? Number(existing.amount);
    const effectivePaidBy = paidBy ?? existing.payers[0]?.userId;
    const effectiveSplitAmong =
      splitAmong ?? existing.splits.map((s) => s.userId);

    if (!effectivePaidBy || !memberUserIds.has(effectivePaidBy)) {
      return NextResponse.json(
        { error: "Payer is not a group member" },
        { status: 400 }
      );
    }

    if (effectiveSplitAmong.length === 0) {
      return NextResponse.json(
        { error: "splitAmong must not be empty" },
        { status: 400 }
      );
    }

    for (const userId of effectiveSplitAmong) {
      if (!memberUserIds.has(userId)) {
        return NextResponse.json(
          { error: `User ${userId} is not a group member` },
          { status: 400 }
        );
      }
    }

    newSplits = computeEqualSplits(
      effectiveAmount,
      effectiveSplitAmong,
      groupMembers
    );
    newPayer = { userId: effectivePaidBy, amount: effectiveAmount };
  }

  const updateData: {
    description?: string;
    amount?: number;
    date?: Date;
  } = {};
  if (title !== undefined) updateData.description = title;
  if (amount !== undefined) updateData.amount = amount;
  if (date !== undefined) updateData.date = new Date(date);

  const updated = await db.$transaction(async (tx) => {
    if (newSplits && newPayer) {
      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      await tx.expensePayer.deleteMany({ where: { expenseId } });
      await tx.expenseSplit.createMany({
        data: newSplits.map((s) => ({ ...s, expenseId })),
      });
      await tx.expensePayer.create({
        data: { ...newPayer, expenseId },
      });
    }

    return tx.expense.update({
      where: { id: expenseId },
      data: updateData,
      include: {
        payers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        splits: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: expenseId } = await params;

  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: { id: true, createdById: true, deletedAt: true },
  });

  if (!expense || expense.deletedAt !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (expense.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await db.expense.update({
    where: { id: expenseId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json(deleted);
}
