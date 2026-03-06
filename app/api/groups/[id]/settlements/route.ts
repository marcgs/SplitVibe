import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSettlementSchema = z
  .object({
    payerId: z.string().min(1),
    payeeId: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().min(1).max(10).default("USD"),
    date: z.string().refine((v) => !isNaN(Date.parse(v)), {
      message: "Invalid date",
    }),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.payerId !== data.payeeId, {
    message: "Payer and payee must be different",
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

  const parsed = createSettlementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { payerId, payeeId, amount, currency, date, notes } = parsed.data;

  const settlement = await db.settlement.create({
    data: {
      groupId,
      payerId,
      payeeId,
      amount,
      currency,
      date: new Date(date),
      notes,
    },
  });

  return NextResponse.json(settlement, { status: 201 });
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

  const settlements = await db.settlement.findMany({
    where: { groupId, deletedAt: null },
    include: {
      payer: { select: { id: true, name: true, email: true } },
      payee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(settlements);
}
