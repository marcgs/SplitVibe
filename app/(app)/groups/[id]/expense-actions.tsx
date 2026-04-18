"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface ExpenseActionsProps {
  expenseId: string;
  groupId: string;
  members: Member[];
  initialTitle: string;
  initialAmount: number;
  initialPaidBy: string;
  initialSplitAmong: string[];
  initialDate: string;
}

export default function ExpenseActions({
  expenseId,
  members,
  initialTitle,
  initialAmount,
  initialPaidBy,
  initialSplitAmong,
  initialDate,
}: ExpenseActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [amount, setAmount] = useState(initialAmount.toFixed(2));
  const [paidBy, setPaidBy] = useState(initialPaidBy);
  const [splitAmong, setSplitAmong] = useState<string[]>(initialSplitAmong);
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleSplitMember(userId: string) {
    setSplitAmong((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  async function handleDelete() {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to delete expense");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          amount: parseFloat(amount),
          paidBy,
          splitAmong,
          date,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to update expense");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
        >
          {loading ? "Deleting…" : "Delete"}
        </button>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Title
        </label>
        <input
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Amount (USD)
        </label>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Paid by
        </label>
        <select
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user.name ?? m.user.email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Split among
        </label>
        <div className="space-y-1">
          {members.map((m) => (
            <label key={m.userId} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={splitAmong.includes(m.userId)}
                onChange={() => toggleSplitMember(m.userId)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              {m.user.name ?? m.user.email}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Date
        </label>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !title.trim() || !amount || splitAmong.length === 0}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError("");
            setTitle(initialTitle);
            setAmount(initialAmount.toFixed(2));
            setPaidBy(initialPaidBy);
            setSplitAmong(initialSplitAmong);
            setDate(initialDate);
          }}
          disabled={loading}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
