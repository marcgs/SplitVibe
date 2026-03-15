import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { downloadBlob } from "@/lib/storage";
import { Readable } from "stream";

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

  const { stream, contentType, contentLength } = await downloadBlob(attachment.blobUrl);

  const webStream = Readable.toWeb(Readable.from(stream)) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
