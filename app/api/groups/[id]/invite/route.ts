import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify user is an admin of this group
  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: id, userId: session.user.id },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can manage invite links" },
      { status: 403 }
    );
  }

  // Generate a new invite token (revokes the old one)
  const newToken = randomUUID();
  const group = await db.group.update({
    where: { id },
    data: { inviteToken: newToken },
    select: { id: true, inviteToken: true },
  });

  return NextResponse.json(group);
}
