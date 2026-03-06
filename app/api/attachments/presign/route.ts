import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateUploadSasUrl } from "@/lib/storage";
import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS_PER_EXPENSE = 5;
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

const presignSchema = z.object({
  expenseId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
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

  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { expenseId, fileName, contentType, fileSize } = parsed.data;

  // Validate content type
  if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    return NextResponse.json(
      { error: "File type not allowed. Accepted: JPEG, PNG, WebP, HEIC, PDF." },
      { status: 400 }
    );
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
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

  const { uploadUrl, blobName } = await generateUploadSasUrl(fileName, contentType);

  return NextResponse.json({ uploadUrl, blobName });
}
