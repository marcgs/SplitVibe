"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteSettlementButtonProps {
  settlementId: string;
  createdAt: Date;
}

export default function DeleteSettlementButton({
  settlementId,
  createdAt,
}: DeleteSettlementButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const withinWindow =
    Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;

  if (!withinWindow) {
    return null;
  }

  async function handleDelete() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/settlements/${settlementId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete settlement");
        return;
      }

      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
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
