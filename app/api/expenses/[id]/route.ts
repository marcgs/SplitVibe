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

interface GroupMemberWithUser {
  userId: string;
  user: { id: string; name: string | null; email: string };
}

function buildSplits(
  amount: number,
  splitAmong: string[],
  groupMembers: GroupMemberWithUser[]
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

  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      groupId: true,
      createdById: true,
      deletedAt: true,
      description: true,
      amount: true,
      currency: true,
      date: true,
    },
  });

  if (!expense || expense.deletedAt !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (expense.createdById !== session.user.id) {
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

  const groupMembers = await db.groupMember.findMany({
    where: { groupId: expense.groupId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const memberUserIds = new Set(groupMembers.map((m) => m.userId));

  if (paidBy !== undefined && !memberUserIds.has(paidBy)) {
    return NextResponse.json(
      { error: "Payer is not a group member" },
      { status: 400 }
    );
  }

  if (splitAmong !== undefined) {
    for (const userId of splitAmong) {
      if (!memberUserIds.has(userId)) {
        return NextResponse.json(
          { error: `User ${userId} is not a group member` },
          { status: 400 }
        );
      }
    }
  }

  const newAmount = amount ?? Number(expense.amount);

  const expenseUpdateData: {
    description?: string;
    amount?: number;
    date?: Date;
  } = {};
  if (title !== undefined) expenseUpdateData.description = title;
  if (amount !== undefined) expenseUpdateData.amount = amount;
  if (date !== undefined) expenseUpdateData.date = new Date(date);

  await db.$transaction(async (tx) => {
    if (Object.keys(expenseUpdateData).length > 0) {
      await tx.expense.update({
        where: { id: expenseId },
        data: expenseUpdateData,
      });
    }

    // Replace ExpenseSplit rows when amount or splitAmong changes.
    if (amount !== undefined || splitAmong !== undefined) {
      const effectiveSplitAmong =
        splitAmong ??
        (
          await tx.expenseSplit.findMany({
            where: { expenseId },
            select: { userId: true },
          })
        ).map((s) => s.userId);

      const splitData = buildSplits(newAmount, effectiveSplitAmong, groupMembers);

      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      await tx.expenseSplit.createMany({
        data: splitData.map((s) => ({ ...s, expenseId })),
      });
    }

    // Replace ExpensePayer rows when amount or paidBy changes.
    if (amount !== undefined || paidBy !== undefined) {
      const effectivePaidBy =
        paidBy ??
        (
          await tx.expensePayer.findFirst({
            where: { expenseId },
            select: { userId: true },
          })
        )?.userId;

      if (effectivePaidBy) {
        await tx.expensePayer.deleteMany({ where: { expenseId } });
        await tx.expensePayer.create({
          data: { expenseId, userId: effectivePaidBy, amount: newAmount },
        });
      }
    }
  });

  const updated = await db.expense.findUnique({
    where: { id: expenseId },
    include: {
      payers: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      splits: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
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
