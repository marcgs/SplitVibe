import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updatePreferencesSchema = z.object({
  preferredCurrency: z
    .string()
    .min(3)
    .max(10)
    .regex(/^[A-Z]{3,10}$/, { message: "Currency must be an ISO 4217 code" })
    .optional(),
});

export async function PATCH(request: Request) {
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

  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: { preferredCurrency?: string } = {};
  if (parsed.data.preferredCurrency) {
    data.preferredCurrency = parsed.data.preferredCurrency.toUpperCase();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, preferredCurrency: true },
  });

  return NextResponse.json(user);
}
