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
  percentages: z.record(z.string(), z.number()).optional(),
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

  // Validate split mode specific fields
  if (splitMode === "PERCENTAGE" && !percentages) {
    return NextResponse.json(
      { error: "Percentages are required for PERCENTAGE split mode" },
      { status: 400 }
    );
  }

  if (splitMode === "SHARES" && !shares) {
    return NextResponse.json(
      { error: "Shares are required for SHARES split mode" },
      { status: 400 }
    );
  }

  if (splitMode === "PERCENTAGE" && percentages) {
    const total = Object.values(percentages).reduce((sum, p) => sum + p, 0);
    if (Math.abs(total - 100) > 0.01) {
      return NextResponse.json(
        { error: "Percentages must sum to 100%" },
        { status: 400 }
      );
    }
  }

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

  // Convert amount to cents (integer) for split calculation
  const amountCents = Math.round(amount * 100);

  // Sort participants alphabetically by name (then email) to determine who gets remainder
  const participantMembers = groupMembers
    .filter((m) => splitAmong.includes(m.userId))
    .sort((a, b) => {
      const nameA = (a.user.name ?? a.user.email).toLowerCase();
      const nameB = (b.user.name ?? b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  // Determine remainder recipient: payer if they are a split participant, otherwise first alphabetically
  const payerIsParticipant = splitAmong.includes(paidBy);
  const remainderRecipientId = payerIsParticipant ? paidBy : participantMembers[0].userId;

  let splitData: { userId: string; amount: number; percentage?: number; shares?: number }[];

  if (splitMode === "PERCENTAGE" && percentages) {
    // Calculate each participant's amount from their percentage
    const rawCents = participantMembers.map((member) => ({
      userId: member.userId,
      cents: Math.floor((amountCents * (percentages[member.userId] ?? 0)) / 100),
      percentage: percentages[member.userId] ?? 0,
    }));

    const totalAssigned = rawCents.reduce((sum, r) => sum + r.cents, 0);
    const remainder = amountCents - totalAssigned;

    splitData = rawCents.map((r) => ({
      userId: r.userId,
      amount: (r.cents + (r.userId === remainderRecipientId ? remainder : 0)) / 100,
      percentage: r.percentage,
    }));
  } else if (splitMode === "SHARES" && shares) {
    // Calculate each participant's amount from their weight
    const totalWeight = participantMembers.reduce(
      (sum, m) => sum + (shares[m.userId] ?? 0),
      0
    );

    const rawCents = participantMembers.map((member) => {
      const weight = shares[member.userId] ?? 0;
      return {
        userId: member.userId,
        cents: Math.floor((amountCents * weight) / totalWeight),
        shares: weight,
      };
    });

    const totalAssigned = rawCents.reduce((sum, r) => sum + r.cents, 0);
    const remainder = amountCents - totalAssigned;

    splitData = rawCents.map((r) => ({
      userId: r.userId,
      amount: (r.cents + (r.userId === remainderRecipientId ? remainder : 0)) / 100,
      shares: r.shares,
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
