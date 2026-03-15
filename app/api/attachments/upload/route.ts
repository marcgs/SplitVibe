import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBlob } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS_PER_EXPENSE = 5;
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const expenseId = formData.get("expenseId");

  if (!(file instanceof File) || typeof expenseId !== "string" || !expenseId) {
    return NextResponse.json(
      { error: "Missing required fields: file and expenseId" },
      { status: 400 }
    );
  }

  // Validate content type
  if (
    !ALLOWED_CONTENT_TYPES.includes(
      file.type as (typeof ALLOWED_CONTENT_TYPES)[number]
    )
  ) {
    return NextResponse.json(
      { error: "File type not allowed. Accepted: JPEG, PNG, WebP, HEIC, PDF." },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds the 10 MB size limit." },
      { status: 400 }
    );
  }

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

  // Check attachment count
  const attachmentCount = await db.attachment.count({
    where: { expenseId },
  });

  if (attachmentCount >= MAX_ATTACHMENTS_PER_EXPENSE) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_ATTACHMENTS_PER_EXPENSE} attachments per expense reached.` },
      { status: 400 }
    );
  }

  try {
    const { blobName } = await uploadBlob(
      file.stream(),
      file.type,
      file.name,
      file.size
    );

    const attachment = await db.attachment.create({
      data: {
        expenseId,
        fileName: file.name,
        contentType: file.type,
        blobUrl: blobName,
        sizeBytes: file.size,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown storage error";
    console.error("Upload error:", message);
    return NextResponse.json(
      { error: "Storage error", details: message },
      { status: 500 }
    );
  }
}
