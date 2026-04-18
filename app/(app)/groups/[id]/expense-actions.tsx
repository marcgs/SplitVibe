"use client";

import { useState } from "react";
import EditExpenseForm from "./edit-expense-form";
import DeleteExpenseButton from "./delete-expense-button";

interface Member {
  userId: string;
  user: { id: string; name: string | null; email: string };
}

interface ExpenseActionsProps {
  expenseId: string;
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
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditExpenseForm
        expenseId={expenseId}
        members={members}
        initialTitle={initialTitle}
        initialAmount={initialAmount}
        initialPaidBy={initialPaidBy}
        initialSplitAmong={initialSplitAmong}
        initialDate={initialDate}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Edit
      </button>
      <DeleteExpenseButton expenseId={expenseId} />
    </div>
  );
}
