import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { token } = await params;

  const group = await db.group.findUnique({
    where: { inviteToken: token },
    select: { id: true, name: true, description: true },
  });

  if (!group) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold tracking-tight text-red-600">
            Invalid Invite Link
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This invite link is invalid or has been revoked.
          </p>
          <Link
            href="/groups"
            className="block w-full rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to Groups
          </Link>
        </div>
      </div>
    );
  }

  // Check if already a member
  const existing = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: group.id, userId: session.user.id },
    },
  });

  if (!existing) {
    await db.groupMember.create({
      data: {
        groupId: group.id,
        userId: session.user.id,
        role: "member",
      },
    });
  }

  redirect(`/groups/${group.id}`);
}
