import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function GroupsPage() {
  const session = await auth();

  const groups = await db.group.findMany({
    where: {
      members: {
        some: { userId: session?.user?.id },
      },
    },
    include: {
      _count: { select: { members: true, expenses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">SplitVibe</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {session?.user?.name}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Groups</h2>
          <Link
            href="/groups/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create Group
          </Link>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You&apos;re not in any groups yet. Create one to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{group.name}</h3>
                    {group.description && (
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-zinc-500 dark:text-zinc-400">
                    <div>{group._count.members} members</div>
                    <div>{group._count.expenses} expenses</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
