import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = {
  user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" },
};

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockTx = {
  expenseSplit: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  expensePayer: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  expense: {
    update: vi.fn(),
  },
};

const mockDb = {
  groupMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  expense: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  expenseSplit: {
    findMany: vi.fn(),
  },
  expensePayer: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(
    async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)
  ),
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown, method: "PATCH" | "DELETE" = "PATCH"): Request {
  return new Request("http://localhost/api/expenses/exp-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultParams = { params: Promise.resolve({ id: "exp-1" }) };

const threeMembers = [
  { userId: "user-1", user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } },
  { userId: "user-2", user: { id: "user-2", name: "Bob", email: "bob@splitvibe.dev" } },
  { userId: "user-3", user: { id: "user-3", name: "Carol", email: "carol@splitvibe.dev" } },
];

function existingExpense(overrides: Partial<{
  createdById: string | null;
  deletedAt: Date | null;
  amount: number;
  groupId: string;
}> = {}) {
  return {
    id: "exp-1",
    groupId: "grp-1",
    createdById: "user-1",
    amount: 90,
    deletedAt: null,
    ...overrides,
  };
}

// ---------- PATCH tests --------------------------------------------------

describe("PATCH /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
    mockDb.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)
    );
  });

  it("updates amount from $90 to $60 and replaces splits with $20/$20/$20", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expenseSplit.findMany.mockResolvedValue([
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: "user-3" },
    ]);
    mockDb.expensePayer.findFirst.mockResolvedValue({ userId: "user-1" });
    mockTx.expense.update.mockResolvedValue({ id: "exp-1", amount: 60 });

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(200);

    expect(mockTx.expenseSplit.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    const createdSplits = mockTx.expenseSplit.createMany.mock.calls[0][0].data;
    expect(createdSplits).toHaveLength(3);
    expect(createdSplits.every((s: { amount: number }) => s.amount === 20)).toBe(true);

    expect(mockTx.expensePayer.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    const payerCreate = mockTx.expensePayer.create.mock.calls[0][0].data;
    expect(payerCreate).toEqual({
      expenseId: "exp-1",
      userId: "user-1",
      amount: 60,
    });
  });

  it("re-distributes remainder cents alphabetically when amount changes", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expenseSplit.findMany.mockResolvedValue([
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: "user-3" },
    ]);
    mockDb.expensePayer.findFirst.mockResolvedValue({ userId: "user-1" });
    mockTx.expense.update.mockResolvedValue({ id: "exp-1" });

    const res = await PATCH(jsonRequest({ amount: 100 }), defaultParams);
    expect(res.status).toBe(200);

    const splits = mockTx.expenseSplit.createMany.mock.calls[0][0].data;
    const alice = splits.find((s: { userId: string }) => s.userId === "user-1");
    const bob = splits.find((s: { userId: string }) => s.userId === "user-2");
    const carol = splits.find((s: { userId: string }) => s.userId === "user-3");
    expect(alice.amount).toBeCloseTo(33.34, 2);
    expect(bob.amount).toBeCloseTo(33.33, 2);
    expect(carol.amount).toBeCloseTo(33.33, 2);
  });

  it("updates only the title without touching splits or payers", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockTx.expense.update.mockResolvedValue({ id: "exp-1", description: "Brunch" });

    const res = await PATCH(jsonRequest({ title: "Brunch" }), defaultParams);
    expect(res.status).toBe(200);

    expect(mockTx.expenseSplit.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.expensePayer.deleteMany).not.toHaveBeenCalled();
    const updateData = mockTx.expense.update.mock.calls[0][0].data;
    expect(updateData).toEqual({ description: "Brunch" });
  });

  it("changes splitAmong subset and computes correct splits", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense({ amount: 90 }));
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expensePayer.findFirst.mockResolvedValue({ userId: "user-1" });
    mockTx.expense.update.mockResolvedValue({ id: "exp-1" });

    const res = await PATCH(
      jsonRequest({ splitAmong: ["user-1", "user-2"] }),
      defaultParams
    );
    expect(res.status).toBe(200);

    const splits = mockTx.expenseSplit.createMany.mock.calls[0][0].data;
    expect(splits).toHaveLength(2);
    expect(splits.every((s: { amount: number }) => s.amount === 45)).toBe(true);
  });

  it("returns 403 when current user is not the creator", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      existingExpense({ createdById: "user-2" })
    );

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(403);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns 403 when expense has no recorded creator (legacy row)", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      existingExpense({ createdById: null })
    );

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(403);
  });

  it("returns 403 when creator is no longer a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(403);
  });

  it("returns 404 when expense does not exist", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when expense is already soft-deleted", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      existingExpense({ deletedAt: new Date() })
    );

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const req = new Request("http://localhost/api/expenses/exp-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no fields are provided", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest({}), defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is non-positive", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest({ amount: 0 }), defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when splitAmong contains duplicates", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ splitAmong: ["user-1", "user-1", "user-2"] }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when paidBy is not a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ paidBy: "outsider" }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a splitAmong user is not a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ splitAmong: ["user-1", "outsider"] }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(401);
  });
});

// ---------- DELETE tests -------------------------------------------------

describe("DELETE /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("soft-deletes by setting deletedAt and returns the updated row", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.expense.update.mockResolvedValue({
      id: "exp-1",
      deletedAt: new Date(),
    });

    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(200);

    const updateCall = mockDb.expense.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "exp-1" });
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  it("returns 403 when current user is not the creator", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      existingExpense({ createdById: "user-2" })
    );

    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
  });

  it("returns 403 for legacy expenses with no recorded creator", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      existingExpense({ createdById: null })
    );

    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(403);
  });

  it("returns 403 when creator is no longer a group member", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(existingExpense());
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(403);
  });

  it("returns 404 when expense does not exist", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when expense is already soft-deleted", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      existingExpense({ deletedAt: new Date() })
    );

    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    const res = await DELETE(jsonRequest({}, "DELETE"), defaultParams);
    expect(res.status).toBe(401);
  });
});
