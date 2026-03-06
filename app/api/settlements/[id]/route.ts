import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const DELETION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: settlementId } = await params;

  // Fetch the settlement
  const settlement = await db.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!settlement || settlement.deletedAt !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check membership in the settlement's group
  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: settlement.groupId, userId: session.user.id },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check the 24-hour deletion window
  const now = Date.now();
  const createdAt = settlement.createdAt.getTime();
  if (now - createdAt > DELETION_WINDOW_MS) {
    return NextResponse.json(
      { error: "Deletion window has passed (24 hours)" },
      { status: 403 }
    );
  }

  // Soft-delete: set deletedAt
  const deleted = await db.settlement.update({
    where: { id: settlementId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json(deleted);
}
