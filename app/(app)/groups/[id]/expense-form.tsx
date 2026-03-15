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

interface ExpenseFormProps {
  groupId: string;
  members: Member[];
  currentUserId: string;
}

type SplitMode = "EQUAL" | "PERCENTAGE" | "SHARES";

export default function ExpenseForm({ groupId, members, currentUserId }: ExpenseFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitAmong, setSplitAmong] = useState<string[]>(
    members.map((m) => m.userId)
  );
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});
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

    if (splitMode === "PERCENTAGE") {
      const sum = splitAmong.reduce((acc, uid) => acc + (parseFloat(percentages[uid] || "0")), 0);
      if (Math.abs(sum - 100) > 0.001) {
        setError("Percentages must sum to 100%");
        return;
      }
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        title,
        amount: parseFloat(amount),
        paidBy,
        splitAmong,
        date,
        splitMode,
      };

      if (splitMode === "PERCENTAGE") {
        const pctMap: Record<string, number> = {};
        for (const uid of splitAmong) {
          pctMap[uid] = parseFloat(percentages[uid] || "0");
        }
        body.percentages = pctMap;
      }

      if (splitMode === "SHARES") {
        const sharesMap: Record<string, number> = {};
        for (const uid of splitAmong) {
          sharesMap[uid] = parseInt(shares[uid] || "1", 10);
        }
        body.shares = sharesMap;
      }

      const res = await fetch(`/api/groups/${groupId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create expense");
        return;
      }

      setTitle("");
      setAmount("");
      setPaidBy(currentUserId);
      setSplitAmong(members.map((m) => m.userId));
      setDate(new Date().toISOString().split("T")[0]);
      setSplitMode("EQUAL");
      setPercentages({});
      setShares({});
      router.refresh();
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
        <label
          htmlFor="expense-split-mode"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Split mode
        </label>
        <select
          id="expense-split-mode"
          value={splitMode}
          onChange={(e) => setSplitMode(e.target.value as SplitMode)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="EQUAL">Equal</option>
          <option value="PERCENTAGE">Percentage</option>
          <option value="SHARES">Shares</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Split among
        </label>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={splitAmong.includes(m.userId)}
                  onChange={() => toggleSplitMember(m.userId)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                {m.user.name ?? m.user.email}
              </label>
              {splitMode === "PERCENTAGE" && splitAmong.includes(m.userId) && (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={percentages[m.userId] ?? ""}
                  onChange={(e) =>
                    setPercentages((prev) => ({ ...prev, [m.userId]: e.target.value }))
                  }
                  placeholder="%"
                  className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              )}
              {splitMode === "SHARES" && splitAmong.includes(m.userId) && (
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shares[m.userId] ?? ""}
                  onChange={(e) =>
                    setShares((prev) => ({ ...prev, [m.userId]: e.target.value }))
                  }
                  placeholder="Weight"
                  className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              )}
            </div>
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
        {loading ? "Adding…" : "Add Expense"}
      </button>
    </form>
  );
}
