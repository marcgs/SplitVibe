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

  // Validate percentage mode: percentages must sum to 100
  if (splitMode === "PERCENTAGE") {
    if (!percentages) {
      return NextResponse.json(
        { error: "Percentages are required for PERCENTAGE split mode" },
        { status: 400 }
      );
    }
    const sum = splitAmong.reduce((acc, uid) => acc + (percentages[uid] ?? 0), 0);
    if (Math.abs(sum - 100) > 0.001) {
      return NextResponse.json(
        { error: "Percentages must sum to 100%" },
        { status: 400 }
      );
    }
  }

  // Validate shares mode: shares must be provided
  if (splitMode === "SHARES") {
    if (!shares) {
      return NextResponse.json(
        { error: "Shares are required for SHARES split mode" },
        { status: 400 }
      );
    }
  }

  const amountCents = Math.round(amount * 100);

  // Sort participants alphabetically by name (then email) to determine who gets remainder
  const participantMembers = groupMembers
    .filter((m) => splitAmong.includes(m.userId))
    .sort((a, b) => {
      const nameA = (a.user.name ?? a.user.email).toLowerCase();
      const nameB = (b.user.name ?? b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  // Determine remainder recipient: payer if participant, else first alphabetically
  const payerIsParticipant = splitAmong.includes(paidBy);
  const remainderUserId = payerIsParticipant ? paidBy : participantMembers[0].userId;

  let splitData: { userId: string; amount: number }[];

  if (splitMode === "PERCENTAGE") {
    // Compute each split from percentage, assign rounding remainder
    const rawSplits = participantMembers.map((member) => {
      const pct = percentages![member.userId] ?? 0;
      const splitCents = Math.floor((pct / 100) * amountCents);
      return { userId: member.userId, cents: splitCents };
    });
    const totalAssigned = rawSplits.reduce((acc, s) => acc + s.cents, 0);
    const remainder = amountCents - totalAssigned;
    splitData = rawSplits.map((s) => ({
      userId: s.userId,
      amount: (s.cents + (s.userId === remainderUserId ? remainder : 0)) / 100,
    }));
  } else if (splitMode === "SHARES") {
    // Compute each split from weight proportion, assign rounding remainder
    const totalWeight = participantMembers.reduce(
      (acc, m) => acc + (shares![m.userId] ?? 1),
      0
    );
    const rawSplits = participantMembers.map((member) => {
      const weight = shares![member.userId] ?? 1;
      const splitCents = Math.floor((weight / totalWeight) * amountCents);
      return { userId: member.userId, cents: splitCents };
    });
    const totalAssigned = rawSplits.reduce((acc, s) => acc + s.cents, 0);
    const remainder = amountCents - totalAssigned;
    splitData = rawSplits.map((s) => ({
      userId: s.userId,
      amount: (s.cents + (s.userId === remainderUserId ? remainder : 0)) / 100,
    }));
  } else {
    // EQUAL split
    const participantCount = splitAmong.length;
    const baseSplitCents = Math.floor(amountCents / participantCount);
    const remainderCents = amountCents - baseSplitCents * participantCount;
    splitData = participantMembers.map((member, index) => {
      const extraCent = index < remainderCents ? 1 : 0;
      const splitCents = baseSplitCents + extraCent;
      return {
        userId: member.userId,
        amount: splitCents / 100,
      };
    });
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
