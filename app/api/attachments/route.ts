import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const saveAttachmentSchema = z.object({
  expenseId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  blobName: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = saveAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { expenseId, fileName, contentType, blobName, sizeBytes } = parsed.data;

  // Check expense exists
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: { id: true, groupId: true },
  });

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  // Check membership
  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: expense.groupId, userId: session.user.id },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachment = await db.attachment.create({
    data: {
      expenseId,
      fileName,
      contentType,
      blobUrl: blobName,
      sizeBytes,
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}
