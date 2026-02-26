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

/**
 * Apply rounding rule: floor each amount to cents, then distribute remainder.
 * Remainder goes to the payer if they are a split participant, otherwise to
 * the first participant alphabetically (participants are already sorted).
 */
function applyRounding(
  rawCents: { userId: string; cents: number }[],
  totalCents: number,
  payerId: string,
  splitAmong: string[]
): { userId: string; amount: number }[] {
  const floored = rawCents.map((r) => ({
    userId: r.userId,
    cents: Math.floor(r.cents),
  }));

  const distributed = floored.reduce((s, r) => s + r.cents, 0);
  let remainder = totalCents - distributed;

  // Determine who gets the remainder
  const payerIsParticipant = splitAmong.includes(payerId);

  if (payerIsParticipant) {
    // Give all remainder to payer
    const payerEntry = floored.find((r) => r.userId === payerId);
    if (payerEntry) {
      payerEntry.cents += remainder;
      remainder = 0;
    }
  }

  // If payer was not a participant, distribute 1 cent at a time to participants
  // in alphabetical order (they are already sorted)
  if (remainder > 0) {
    for (let i = 0; remainder > 0 && i < floored.length; i++) {
      floored[i].cents += 1;
      remainder--;
    }
  }

  return floored.map((r) => ({
    userId: r.userId,
    amount: r.cents / 100,
  }));
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

  // Sort participants alphabetically by name (then email)
  const participantMembers = groupMembers
    .filter((m) => splitAmong.includes(m.userId))
    .sort((a, b) => {
      const nameA = (a.user.name ?? a.user.email).toLowerCase();
      const nameB = (b.user.name ?? b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const amountCents = Math.round(amount * 100);
  let splitData: { userId: string; amount: number }[];

  if (splitMode === "PERCENTAGE") {
    // Validate percentages are provided for all participants
    if (!percentages) {
      return NextResponse.json(
        { error: "Percentages are required for PERCENTAGE split mode" },
        { status: 400 }
      );
    }

    // Validate percentages sum to 100
    const total = splitAmong.reduce((sum, uid) => sum + (percentages[uid] ?? 0), 0);
    if (Math.abs(total - 100) > 0.001) {
      return NextResponse.json(
        { error: "Percentages must sum to 100" },
        { status: 400 }
      );
    }

    // Compute amounts in cents, then apply rounding rule
    const rawCents = participantMembers.map((m) => ({
      userId: m.userId,
      cents: (amountCents * (percentages[m.userId] ?? 0)) / 100,
    }));
    splitData = applyRounding(rawCents, amountCents, paidBy, splitAmong);
  } else if (splitMode === "SHARES") {
    // Validate shares are provided for all participants
    if (!shares) {
      return NextResponse.json(
        { error: "Shares are required for SHARES split mode" },
        { status: 400 }
      );
    }

    const totalWeight = splitAmong.reduce((sum, uid) => sum + (shares[uid] ?? 0), 0);
    if (totalWeight <= 0) {
      return NextResponse.json(
        { error: "Total shares must be positive" },
        { status: 400 }
      );
    }

    // Compute amounts in cents, then apply rounding rule
    const rawCents = participantMembers.map((m) => ({
      userId: m.userId,
      cents: (amountCents * (shares[m.userId] ?? 0)) / totalWeight,
    }));
    splitData = applyRounding(rawCents, amountCents, paidBy, splitAmong);
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
