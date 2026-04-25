import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const patchExpenseSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    amount: z.number().positive().optional(),
    paidBy: z.string().min(1).optional(),
    splitAmong: z.array(z.string().min(1)).min(1).optional(),
    date: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

interface GroupMemberWithUser {
  userId: string;
  user: { id: string; name: string | null; email: string };
}

function computeEqualSplits(
  amount: number,
  participants: GroupMemberWithUser[]
): { userId: string; amount: number }[] {
  const amountCents = Math.round(amount * 100);
  const n = participants.length;
  const baseCents = Math.floor(amountCents / n);
  const remainderCents = amountCents - baseCents * n;

  const sorted = [...participants].sort((a, b) => {
    const nameA = (a.user.name ?? a.user.email).toLowerCase();
    const nameB = (b.user.name ?? b.user.email).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return sorted.map((member, i) => ({
    userId: member.userId,
    amount: (baseCents + (i < remainderCents ? 1 : 0)) / 100,
  }));
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      groupId: true,
      createdById: true,
      amount: true,
      deletedAt: true,
    },
  });

  if (!expense || expense.deletedAt !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Legacy rows without a recorded creator cannot be mutated.
  if (expense.createdById === null || expense.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Creator must still be a member of the group.
  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: expense.groupId, userId: session.user.id },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, amount, paidBy, splitAmong, date } = parsed.data;

  let splitData: { userId: string; amount: number }[] | null = null;
  let payerData: { userId: string; amount: number } | null = null;

  const newAmount = amount ?? Number(expense.amount);

  if (splitAmong !== undefined || amount !== undefined || paidBy !== undefined) {
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
      const uniqueIds = new Set(splitAmong);
      if (uniqueIds.size !== splitAmong.length) {
        return NextResponse.json(
          { error: "splitAmong contains duplicate user IDs" },
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
    }

    if (splitAmong !== undefined || amount !== undefined) {
      let participantIds: string[];
      if (splitAmong !== undefined) {
        participantIds = splitAmong;
      } else {
        const existingSplits = await db.expenseSplit.findMany({
          where: { expenseId },
          select: { userId: true },
        });
        participantIds = existingSplits.map((s) => s.userId);
      }
      const participants = groupMembers.filter((m) =>
        participantIds.includes(m.userId)
      );
      if (participants.length === 0) {
        return NextResponse.json(
          { error: "No valid participants" },
          { status: 400 }
        );
      }
      splitData = computeEqualSplits(newAmount, participants);
    }

    if (paidBy !== undefined || amount !== undefined) {
      const payerId =
        paidBy ??
        (
          await db.expensePayer.findFirst({
            where: { expenseId },
            select: { userId: true },
          })
        )?.userId;
      if (!payerId) {
        return NextResponse.json(
          { error: "Existing payer not found" },
          { status: 400 }
        );
      }
      payerData = { userId: payerId, amount: newAmount };
    }
  }

  const updated = await db.$transaction(async (tx) => {
    if (splitData !== null) {
      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      await tx.expenseSplit.createMany({
        data: splitData.map((s) => ({ ...s, expenseId })),
      });
    }
    if (payerData !== null) {
      await tx.expensePayer.deleteMany({ where: { expenseId } });
      await tx.expensePayer.create({
        data: { ...payerData, expenseId },
      });
    }
    return tx.expense.update({
      where: { id: expenseId },
      data: {
        ...(title !== undefined ? { description: title } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(date !== undefined ? { date: new Date(date) } : {}),
      },
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

  return NextResponse.json(updated, { status: 200 });
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
    select: { id: true, groupId: true, createdById: true, deletedAt: true },
  });

  if (!expense || expense.deletedAt !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (expense.createdById === null || expense.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: expense.groupId, userId: session.user.id },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await db.expense.update({
    where: { id: expenseId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json(deleted, { status: 200 });
}
