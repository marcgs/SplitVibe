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

interface ExistingExpense {
  id: string;
  description: string;
  amount: number;
  date: string;
  payerId: string;
  splitUserIds: string[];
}

interface ExpenseFormProps {
  groupId: string;
  members: Member[];
  currentUserId: string;
  expense?: ExistingExpense;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ExpenseForm({
  groupId,
  members,
  currentUserId,
  expense,
  onSuccess,
  onCancel,
}: ExpenseFormProps) {
  const router = useRouter();
  const isEdit = expense !== undefined;
  const [title, setTitle] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [paidBy, setPaidBy] = useState(expense?.payerId ?? currentUserId);
  const [splitAmong, setSplitAmong] = useState<string[]>(
    expense?.splitUserIds ?? members.map((m) => m.userId)
  );
  const [date, setDate] = useState(
    expense?.date ?? new Date().toISOString().split("T")[0]
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleSplitMember(userId: string) {
    setSplitAmong((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const url = isEdit
        ? `/api/expenses/${expense.id}`
        : `/api/groups/${groupId}/expenses`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
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
        const data = await res.json();
        setError(
          data.error ?? `Failed to ${isEdit ? "update" : "create"} expense`
        );
        return;
      }

      if (!isEdit) {
        setTitle("");
        setAmount("");
        setPaidBy(currentUserId);
        setSplitAmong(members.map((m) => m.userId));
        setDate(new Date().toISOString().split("T")[0]);
      }
      router.refresh();
      onSuccess?.();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <label
          htmlFor="expense-title"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Title
        </label>
        <input
          id="expense-title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Dinner"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label
          htmlFor="expense-amount"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Amount (USD)
        </label>
        <input
          id="expense-amount"
          type="number"
          required
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label
          htmlFor="expense-paid-by"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Paid by
        </label>
        <select
          id="expense-paid-by"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user.name ?? m.user.email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Split among
        </label>
        <div className="space-y-2">
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
        <label
          htmlFor="expense-date"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Date
        </label>
        <input
          id="expense-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !title.trim() || !amount || splitAmong.length === 0}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? (isEdit ? "Saving…" : "Adding…") : isEdit ? "Save changes" : "Add Expense"}
      </button>
      {isEdit && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
