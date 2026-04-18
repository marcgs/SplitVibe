"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ExpenseForm from "./expense-form";

interface Member {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface ExpenseActionsProps {
  groupId: string;
  expenseId: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  payerId: string;
  splitUserIds: string[];
  members: Member[];
  currentUserId: string;
}

export default function ExpenseActions({
  groupId,
  expenseId,
  description,
  amount,
  date,
  payerId,
  splitUserIds,
  members,
  currentUserId,
}: ExpenseActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete expense");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-3">
        <ExpenseForm
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          expense={{
            id: expenseId,
            description,
            amount,
            date,
            payerId,
            splitUserIds,
          }}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
