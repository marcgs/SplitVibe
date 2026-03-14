import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateReadSasUrl } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const attachment = await db.attachment.findUnique({
    where: { id },
    include: { expense: { select: { groupId: true } } },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Check membership
  const membership = await db.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: attachment.expense.groupId,
        userId: session.user.id,
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = await generateReadSasUrl(attachment.blobUrl);

  return NextResponse.json({ url });
}
