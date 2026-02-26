import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createExpenseSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  paidBy: z.string().min(1),
  splitAmong: z.array(z.string().min(1)).min(1),
  date: z.string().refine((v) => !isNaN(Date.parse(v)), {
    message: "Invalid date",
  }),
  splitMode: z.enum(["EQUAL", "PERCENTAGE", "SHARES"]).optional().default("EQUAL"),
  percentages: z.record(z.string(), z.number().min(0).max(100)).optional(),
  shares: z.record(z.string(), z.number().int().positive()).optional(),
});

type ParticipantMember = { userId: string; user: { name: string | null; email: string } };

/**
 * Assign any remainder cents to the correct participant per spec:
 * - If the payer is a split participant, they receive the remainder.
 * - Otherwise, the first participant alphabetically receives the remainder.
 */
function assignRemainder(
  splits: { userId: string; amountCents: number }[],
  remainderCents: number,
  payerId: string,
  sortedParticipantIds: string[]
): void {
  if (remainderCents === 0) return;
  const payerInSplit = sortedParticipantIds.includes(payerId);
  const recipientId = payerInSplit ? payerId : sortedParticipantIds[0];
  const target = splits.find((s) => s.userId === recipientId);
  if (target) target.amountCents += remainderCents;
}

function computeEqualSplit(
  amount: number,
  payerId: string,
  participants: ParticipantMember[]
): { userId: string; amount: number }[] {
  const amountCents = Math.round(amount * 100);
  const count = participants.length;
  const baseCents = Math.floor(amountCents / count);
  const remainderCents = amountCents - baseCents * count;

  const splits = participants.map((m) => ({
    userId: m.userId,
    amountCents: baseCents,
  }));

  assignRemainder(splits, remainderCents, payerId, participants.map((m) => m.userId));

  return splits.map((s) => ({ userId: s.userId, amount: s.amountCents / 100 }));
}

function computePercentageSplit(
  amount: number,
  payerId: string,
  participants: ParticipantMember[],
  percentages: Record<string, number>
): { userId: string; amount: number }[] {
  const amountCents = Math.round(amount * 100);

  const splits = participants.map((m) => {
    const pct = percentages[m.userId] ?? 0;
    return {
      userId: m.userId,
      amountCents: Math.floor((pct / 100) * amountCents),
    };
  });

  const totalAssigned = splits.reduce((sum, s) => sum + s.amountCents, 0);
  const remainderCents = amountCents - totalAssigned;

  assignRemainder(splits, remainderCents, payerId, participants.map((m) => m.userId));

  return splits.map((s) => ({ userId: s.userId, amount: s.amountCents / 100 }));
}

function computeSharesSplit(
  amount: number,
  payerId: string,
  participants: ParticipantMember[],
  shares: Record<string, number>
): { userId: string; amount: number }[] {
  const amountCents = Math.round(amount * 100);
  const totalWeight = participants.reduce((sum, m) => sum + (shares[m.userId] ?? 0), 0);

  const splits = participants.map((m) => {
    const weight = shares[m.userId] ?? 0;
    return {
      userId: m.userId,
      amountCents: Math.floor((weight / totalWeight) * amountCents),
    };
  });

  const totalAssigned = splits.reduce((sum, s) => sum + s.amountCents, 0);
  const remainderCents = amountCents - totalAssigned;

  assignRemainder(splits, remainderCents, payerId, participants.map((m) => m.userId));

  return splits.map((s) => ({ userId: s.userId, amount: s.amountCents / 100 }));
}

export async function POST(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, amount, paidBy, splitAmong, date, splitMode, percentages, shares } = parsed.data;

  // Verify paidBy and all splitAmong users are group members
  const groupMembers = await db.groupMember.findMany({
    where: { groupId },
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

  // Validate mode-specific inputs
  if (splitMode === "PERCENTAGE") {
    if (!percentages) {
      return NextResponse.json(
        { error: "Percentages are required for PERCENTAGE split mode" },
        { status: 400 }
      );
    }
    const total = splitAmong.reduce((sum, uid) => sum + (percentages[uid] ?? 0), 0);
    if (Math.abs(total - 100) > 0.001) {
      return NextResponse.json(
        { error: "Percentages must sum to exactly 100%" },
        { status: 400 }
      );
    }
  }

  if (splitMode === "SHARES") {
    if (!shares) {
      return NextResponse.json(
        { error: "Shares are required for SHARES split mode" },
        { status: 400 }
      );
    }
  }

  // Sort participants alphabetically by name (then email) to determine who gets remainder
  const participantMembers = groupMembers
    .filter((m) => splitAmong.includes(m.userId))
    .sort((a, b) => {
      const nameA = (a.user.name ?? a.user.email).toLowerCase();
      const nameB = (b.user.name ?? b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  // Compute splits based on mode
  let splitData: { userId: string; amount: number }[];

  if (splitMode === "PERCENTAGE") {
    splitData = computePercentageSplit(amount, paidBy, participantMembers, percentages!);
  } else if (splitMode === "SHARES") {
    splitData = computeSharesSplit(amount, paidBy, participantMembers, shares!);
  } else {
    splitData = computeEqualSplit(amount, paidBy, participantMembers);
  }

  const expense = await db.expense.create({
    data: {
      groupId,
      description: title,
      amount,
      currency: "USD",
      splitMode,
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
    include: {
      payers: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      splits: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  return NextResponse.json(expense, { status: 201 });
}

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

  const expenses = await db.expense.findMany({
    where: { groupId, deletedAt: null },
    include: {
      payers: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      splits: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(expenses);
}
