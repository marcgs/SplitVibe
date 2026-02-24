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

interface SettlementFormProps {
  groupId: string;
  members: Member[];
  currentUserId: string;
}

export default function SettlementForm({ groupId, members, currentUserId }: SettlementFormProps) {
  const router = useRouter();
  const [payerId, setPayerId] = useState(currentUserId);
  const [payeeId, setPayeeId] = useState(() => {
    const other = members.find((m) => m.userId !== currentUserId);
    return other?.userId ?? "";
  });
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (payerId === payeeId) {
      setError("Payer and payee must be different");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payerId,
          payeeId,
          amount: parseFloat(amount),
          currency: "USD",
          date,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to record settlement");
        return;
      }

      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div>
        <label
          htmlFor="settlement-payer"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Who paid
        </label>
        <select
          id="settlement-payer"
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
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
          htmlFor="settlement-payee"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Paid to
        </label>
        <select
          id="settlement-payee"
          value={payeeId}
          onChange={(e) => setPayeeId(e.target.value)}
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
          htmlFor="settlement-amount"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Amount (USD)
        </label>
        <input
          id="settlement-amount"
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
          htmlFor="settlement-date"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Date
        </label>
        <input
          id="settlement-date"
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
        disabled={loading || !amount || !payeeId || payerId === payeeId}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "Recording…" : "Record Settlement"}
      </button>
    </form>
  );
}
