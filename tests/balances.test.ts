import { describe, it, expect } from "vitest";
import { calculateBalances, simplifyDebts } from "@/lib/balances";

// ---------- calculateBalances tests ----------------------------------------

describe("calculateBalances", () => {
  it("returns an empty map when there are no expenses or settlements", () => {
    const balances = calculateBalances([], []);
    expect(balances.size).toBe(0);
  });

  it("computes net balances for a single expense split equally among 3", () => {
    // Alice paid $90, split equally among Alice, Bob, Carol ($30 each)
    const expenses = [
      {
        payers: [{ userId: "alice", amount: 90 }],
        splits: [
          { userId: "alice", amount: 30 },
          { userId: "bob", amount: 30 },
          { userId: "carol", amount: 30 },
        ],
      },
    ];

    const balances = calculateBalances(expenses, []);
    // Alice paid 90, owes 30 → net +60
    expect(balances.get("alice")).toBe(60);
    // Bob paid 0, owes 30 → net -30
    expect(balances.get("bob")).toBe(-30);
    // Carol paid 0, owes 30 → net -30
    expect(balances.get("carol")).toBe(-30);
  });

  it("handles multiple expenses correctly", () => {
    const expenses = [
      {
        // Alice paid $60, split equally among Alice & Bob ($30 each)
        payers: [{ userId: "alice", amount: 60 }],
        splits: [
          { userId: "alice", amount: 30 },
          { userId: "bob", amount: 30 },
        ],
      },
      {
        // Bob paid $40, split equally among Alice & Bob ($20 each)
        payers: [{ userId: "bob", amount: 40 }],
        splits: [
          { userId: "alice", amount: 20 },
          { userId: "bob", amount: 20 },
        ],
      },
    ];

    const balances = calculateBalances(expenses, []);
    // Alice: paid 60, owes 30+20=50 → net +10
    expect(balances.get("alice")).toBe(10);
    // Bob: paid 40, owes 30+20=50 → net -10
    expect(balances.get("bob")).toBe(-10);
  });

  it("accounts for settlements", () => {
    const expenses = [
      {
        payers: [{ userId: "alice", amount: 90 }],
        splits: [
          { userId: "alice", amount: 30 },
          { userId: "bob", amount: 30 },
          { userId: "carol", amount: 30 },
        ],
      },
    ];

    // Bob settles $30 with Alice
    const settlements = [
      { payerId: "bob", payeeId: "alice", amount: 30 },
    ];

    const balances = calculateBalances(expenses, settlements);
    // Alice: +60 from expense, then receives 30 settlement → 60 - 30 = +30
    expect(balances.get("alice")).toBe(30);
    // Bob: -30 from expense, then pays 30 settlement → -30 + 30 = 0
    expect(balances.get("bob")).toBe(0);
    // Carol: -30 unchanged
    expect(balances.get("carol")).toBe(-30);
  });

  it("handles a payer not in the split", () => {
    // Alice pays $60 but only Bob and Carol split it
    const expenses = [
      {
        payers: [{ userId: "alice", amount: 60 }],
        splits: [
          { userId: "bob", amount: 30 },
          { userId: "carol", amount: 30 },
        ],
      },
    ];

    const balances = calculateBalances(expenses, []);
    expect(balances.get("alice")).toBe(60);
    expect(balances.get("bob")).toBe(-30);
    expect(balances.get("carol")).toBe(-30);
  });

  it("handles multiple payers for one expense", () => {
    const expenses = [
      {
        payers: [
          { userId: "alice", amount: 50 },
          { userId: "bob", amount: 50 },
        ],
        splits: [
          { userId: "alice", amount: 25 },
          { userId: "bob", amount: 25 },
          { userId: "carol", amount: 50 },
        ],
      },
    ];

    const balances = calculateBalances(expenses, []);
    // Alice: paid 50, owes 25 → +25
    expect(balances.get("alice")).toBe(25);
    // Bob: paid 50, owes 25 → +25
    expect(balances.get("bob")).toBe(25);
    // Carol: paid 0, owes 50 → -50
    expect(balances.get("carol")).toBe(-50);
  });
});

// ---------- simplifyDebts tests --------------------------------------------

describe("simplifyDebts", () => {
  it("returns an empty array when all balances are zero", () => {
    const balances = new Map<string, number>();
    balances.set("alice", 0);
    balances.set("bob", 0);
    const debts = simplifyDebts(balances);
    expect(debts).toEqual([]);
  });

  it("returns an empty array for an empty balances map", () => {
    const debts = simplifyDebts(new Map());
    expect(debts).toEqual([]);
  });

  it("produces a single transaction for two people", () => {
    const balances = new Map<string, number>();
    balances.set("alice", 50);
    balances.set("bob", -50);

    const debts = simplifyDebts(balances);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toEqual({ from: "bob", to: "alice", amount: 50 });
  });

  it("simplifies A→B→C chain into A→C", () => {
    // A owes B £20 (B is net +20 from A), B owes C £20 (C is net +20 from B)
    // Net: A = -20, B = 0, C = +20
    const balances = new Map<string, number>();
    balances.set("a", -20);
    balances.set("b", 0);
    balances.set("c", 20);

    const debts = simplifyDebts(balances);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toEqual({ from: "a", to: "c", amount: 20 });
  });

  it("handles a 3-person scenario with different amounts", () => {
    // Alice is owed 60 total, Bob owes 30, Carol owes 30
    const balances = new Map<string, number>();
    balances.set("alice", 60);
    balances.set("bob", -30);
    balances.set("carol", -30);

    const debts = simplifyDebts(balances);
    expect(debts).toHaveLength(2);

    // Total amount flowing should be 60
    const totalFlow = debts.reduce((sum, d) => sum + d.amount, 0);
    expect(totalFlow).toBe(60);

    // All amounts should be positive
    for (const d of debts) {
      expect(d.amount).toBeGreaterThan(0);
    }
  });

  it("produces minimal transactions for a complex scenario", () => {
    // 4 people: A=+30, B=-10, C=-10, D=-10
    const balances = new Map<string, number>();
    balances.set("a", 30);
    balances.set("b", -10);
    balances.set("c", -10);
    balances.set("d", -10);

    const debts = simplifyDebts(balances);
    expect(debts).toHaveLength(3);

    // Verify net flow adds up
    const totalFlow = debts.reduce((sum, d) => sum + d.amount, 0);
    expect(totalFlow).toBe(30);
  });

  it("handles floating point amounts correctly", () => {
    const balances = new Map<string, number>();
    balances.set("alice", 33.33);
    balances.set("bob", -33.33);

    const debts = simplifyDebts(balances);
    expect(debts).toHaveLength(1);
    expect(debts[0].amount).toBeCloseTo(33.33, 2);
  });
});
