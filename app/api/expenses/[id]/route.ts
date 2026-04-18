import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateExpenseSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  paidBy: z.string().min(1),
  splitAmong: z.array(z.string().min(1)).min(1),
  date: z.string().refine((v) => !isNaN(Date.parse(v)), {
    message: "Invalid date",
  }),
});

interface GroupMemberWithUser {
  userId: string;
  user: { id: string; name: string | null; email: string };
}

function computeEqualSplits(
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
    return {
      userId: member.userId,
      amount: splitCents / 100,
    };
  });
}

const expenseInclude = {
  payers: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  splits: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} as const;

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
    select: { id: true, groupId: true, createdById: true, deletedAt: true },
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

  if (!memberUserIds.has(paidBy)) {
    return NextResponse.json(
      { error: "Payer is not a group member" },
      { status: 400 }
    );
  }

  for (const userId of splitAmong) {
    if (!memberUserIds.has(userId)) {
      return NextResponse.json(
        { error: `User ${userId} is not a group member` },
        { status: 400 }
      );
    }
  }

  const splitData = computeEqualSplits(amount, splitAmong, groupMembers);

  const updated = await db.$transaction(async (tx) => {
    await tx.expensePayer.deleteMany({ where: { expenseId } });
    await tx.expenseSplit.deleteMany({ where: { expenseId } });

    return tx.expense.update({
      where: { id: expenseId },
      data: {
        description: title,
        amount,
        date: new Date(date),
        payers: {
          create: {
            userId: paidBy,
            amount,
          },
        },
        splits: {
          create: splitData,
        },
      },
      include: expenseInclude,
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
