import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import InviteLinkSection from "./invite-link-section";
import ExpenseForm from "./expense-form";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const { id } = await params;

  const group = await db.group.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { joinedAt: "asc" },
      },
      expenses: {
        where: { deletedAt: null },
        include: {
          payers: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!group) {
    notFound();
  }

  const currentMember = group.members.find((m) => m.userId === session.user?.id);
  if (!currentMember) {
    notFound();
  }

  const isAdmin = currentMember.role === "admin";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/groups"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Groups
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          {group.description && (
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              {group.description}
            </p>
          )}
        </div>

        {/* Invite Link Section */}
        {isAdmin && (
          <InviteLinkSection groupId={group.id} inviteToken={group.inviteToken} />
        )}

        {/* Members Section */}
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium">
            Members ({group.members.length})
          </h2>
          <div className="space-y-2">
            {group.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {member.user.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={member.user.image}
                    alt={member.user.name ?? ""}
                    className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800"
                  />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {member.user.name ?? member.user.email}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {member.user.email}
                  </div>
                </div>
                {member.role === "admin" && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    Admin
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Add Expense Section */}
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium">Add Expense</h2>
          <ExpenseForm
            groupId={group.id}
            members={group.members}
            currentUserId={session.user.id}
          />
        </section>

        {/* Expenses List Section */}
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium">
            Expenses ({group.expenses.length})
          </h2>
          {group.expenses.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No expenses yet. Add one above!
            </p>
          ) : (
            <div className="space-y-2">
              {group.expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{expense.description}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Paid by{" "}
                      {expense.payers[0]?.user.name ?? expense.payers[0]?.user.email ?? "Unknown"}{" "}
                      · {new Date(expense.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    ${Number(expense.amount).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
