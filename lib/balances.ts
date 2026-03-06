/**
 * Pure balance-calculation and debt-simplification functions.
 * No database dependency — designed for unit testing.
 */

export interface ExpenseData {
  payers: { userId: string; amount: number }[];
  splits: { userId: string; amount: number }[];
}

export interface SettlementData {
  payerId: string;
  payeeId: string;
  amount: number;
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

/**
 * Calculate the net balance for each user.
 * Positive = owed money (others owe you), Negative = owes money (you owe others).
 *
 * For each expense:
 *   - Payers get +amount (they paid)
 *   - Splits get -amount (they owe)
 *
 * For each settlement:
 *   - Payer (the one paying the debt) gets +amount (reduces what they owe)
 *   - Payee (the one receiving) gets -amount (reduces what they're owed)
 */
export function calculateBalances(
  expenses: ExpenseData[],
  settlements: SettlementData[]
): Map<string, number> {
  const balances = new Map<string, number>();

  function addBalance(userId: string, amount: number) {
    const current = balances.get(userId) ?? 0;
    balances.set(userId, current + amount);
  }

  for (const expense of expenses) {
    for (const payer of expense.payers) {
      addBalance(payer.userId, payer.amount);
    }
    for (const split of expense.splits) {
      addBalance(split.userId, -split.amount);
    }
  }

  for (const settlement of settlements) {
    // Payer paid money to settle a debt → their balance improves
    addBalance(settlement.payerId, settlement.amount);
    // Payee received money → their balance decreases
    addBalance(settlement.payeeId, -settlement.amount);
  }

  return balances;
}

/**
 * Simplify debts using a greedy min-cash-flow algorithm.
 * Given net balances, produce a minimal set of transactions to settle all debts.
 */
export function simplifyDebts(balances: Map<string, number>): SimplifiedDebt[] {
  const EPSILON = 0.001;
  const debts: SimplifiedDebt[] = [];

  // Separate into creditors (positive balance) and debtors (negative balance)
  const creditors: { userId: string; amount: number }[] = [];
  const debtors: { userId: string; amount: number }[] = [];

  for (const [userId, balance] of balances) {
    if (balance > EPSILON) {
      creditors.push({ userId, amount: balance });
    } else if (balance < -EPSILON) {
      debtors.push({ userId, amount: -balance }); // Store as positive
    }
  }

  // Sort both arrays by amount descending for greedy matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const transfer = Math.min(creditors[i].amount, debtors[j].amount);

    if (transfer > EPSILON) {
      debts.push({
        from: debtors[j].userId,
        to: creditors[i].userId,
        amount: Math.round(transfer * 100) / 100,
      });
    }

    creditors[i].amount -= transfer;
    debtors[j].amount -= transfer;

    if (creditors[i].amount < EPSILON) i++;
    if (debtors[j].amount < EPSILON) j++;
  }

  return debts;
}
