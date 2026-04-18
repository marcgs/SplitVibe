import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = {
  user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" },
};

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  groupMember: {
    findMany: vi.fn(),
  },
  expense: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  expenseSplit: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  expensePayer: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)),
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown, method = "PATCH"): Request {
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

function makeExpense(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "exp-1",
    groupId: "grp-1",
    createdById: "user-1",
    deletedAt: null,
    description: "Dinner",
    amount: 90,
    currency: "USD",
    date: new Date("2025-06-15"),
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
      async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)
    );
    mockDb.expenseSplit.findMany.mockResolvedValue([
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: "user-3" },
    ]);
    mockDb.expensePayer.findFirst.mockResolvedValue({ userId: "user-1" });
  });

  it("updates amount from $90 to $60 and rewrites splits ($20 each)", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(200);

    expect(mockDb.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp-1" },
        data: expect.objectContaining({ amount: 60 }),
      })
    );

    expect(mockDb.expenseSplit.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    const createCall = mockDb.expenseSplit.createMany.mock.calls[0][0];
    expect(createCall.data).toHaveLength(3);
    for (const s of createCall.data as { amount: number }[]) {
      expect(s.amount).toBe(20);
    }

    // Payer row also rewritten with new amount
    expect(mockDb.expensePayer.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    expect(mockDb.expensePayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", amount: 60 }),
      })
    );
  });

  it("returns 403 when caller is not the expense creator", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      makeExpense({ createdById: "user-2" })
    );

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
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
      makeExpense({ deletedAt: new Date() })
    );

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());

    const req = new Request("http://localhost/api/expenses/exp-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is not positive", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());

    const res = await PATCH(jsonRequest({ amount: 0 }), defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when paidBy is not a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ paidBy: "non-member" }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a split participant is not a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ splitAmong: ["user-1", "non-member"] }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("updates only the title without touching splits/payers", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(jsonRequest({ title: "Brunch" }), defaultParams);
    expect(res.status).toBe(200);
    expect(mockDb.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Brunch" }),
      })
    );
    expect(mockDb.expenseSplit.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.expensePayer.deleteMany).not.toHaveBeenCalled();
  });
});

// ---------- DELETE tests -------------------------------------------------

describe("DELETE /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("soft-deletes the expense by setting deletedAt", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(makeExpense());
    mockDb.expense.update.mockResolvedValue({
      ...makeExpense(),
      deletedAt: new Date(),
    });

    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(200);

    expect(mockDb.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it("returns 403 when caller is not the expense creator", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      makeExpense({ createdById: "user-2" })
    );

    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when expense does not exist", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when expense is already soft-deleted", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(
      makeExpense({ deletedAt: new Date() })
    );

    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);
    const { DELETE } = await import("@/app/api/expenses/[id]/route");

    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(401);
  });
});
