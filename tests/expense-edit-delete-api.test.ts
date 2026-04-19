import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

interface TxClient {
  expenseSplit: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
  expensePayer: {
    deleteMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  expense: { update: ReturnType<typeof vi.fn> };
}

const txMock: TxClient = {
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
    findMany: vi.fn(),
  },
  expense: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(
    async (cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)
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
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
}

const defaultParams = { params: Promise.resolve({ id: "exp-1" }) };

const threeMembers = [
  { userId: "user-1", user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } },
  { userId: "user-2", user: { id: "user-2", name: "Bob", email: "bob@splitvibe.dev" } },
  { userId: "user-3", user: { id: "user-3", name: "Carol", email: "carol@splitvibe.dev" } },
];

const baseExpense = {
  id: "exp-1",
  groupId: "grp-1",
  createdById: "user-1",
  amount: 90,
  deletedAt: null,
  payers: [{ userId: "user-1" }],
  splits: [
    { userId: "user-1" },
    { userId: "user-2" },
    { userId: "user-3" },
  ],
};

// ---------- PATCH tests --------------------------------------------------

describe("PATCH /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
    txMock.expenseSplit.deleteMany.mockReset();
    txMock.expenseSplit.createMany.mockReset();
    txMock.expensePayer.deleteMany.mockReset();
    txMock.expensePayer.create.mockReset();
    txMock.expense.update.mockReset();
    mockDb.$transaction.mockImplementation(
      async (cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)
    );
  });

  it("updates a $90 expense to $60 and replaces splits accordingly", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(baseExpense);
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    txMock.expense.update.mockResolvedValue({ id: "exp-1", amount: 60 });

    const res = await PATCH(jsonRequest({ amount: 60 }), defaultParams);

    expect(res.status).toBe(200);

    // Splits & payer rows replaced atomically
    expect(txMock.expenseSplit.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    expect(txMock.expensePayer.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });

    const createManyArgs = txMock.expenseSplit.createMany.mock.calls[0][0];
    expect(createManyArgs.data).toHaveLength(3);
    for (const split of createManyArgs.data) {
      expect(split.amount).toBeCloseTo(20, 2);
      expect(split.expenseId).toBe("exp-1");
    }

    expect(txMock.expensePayer.create).toHaveBeenCalledWith({
      data: { userId: "user-1", amount: 60, expenseId: "exp-1" },
    });

    expect(txMock.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp-1" },
        data: expect.objectContaining({ amount: 60 }),
      })
    );
  });

  it("updates the title without recomputing splits", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(baseExpense);
    txMock.expense.update.mockResolvedValue({ id: "exp-1" });

    const res = await PATCH(jsonRequest({ title: "Updated" }), defaultParams);

    expect(res.status).toBe(200);
    expect(txMock.expenseSplit.deleteMany).not.toHaveBeenCalled();
    expect(txMock.expensePayer.deleteMany).not.toHaveBeenCalled();
    expect(txMock.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Updated" }),
      })
    );
  });

  it("returns 403 when caller is not the creator", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      ...baseExpense,
      createdById: "user-2",
    });

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
    mockDb.expense.findUnique.mockResolvedValue({
      ...baseExpense,
      deletedAt: new Date(),
    });
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
    mockDb.expense.findUnique.mockResolvedValue(baseExpense);

    const req = new Request("http://localhost/api/expenses/exp-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when paidBy is not a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(baseExpense);
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(jsonRequest({ paidBy: "non-member" }), defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when splitAmong contains a non-member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(baseExpense);
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ splitAmong: ["user-1", "non-member"] }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });
});

// ---------- DELETE tests -------------------------------------------------

describe("DELETE /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("soft-deletes the expense (sets deletedAt) and returns 200", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.expense.update.mockResolvedValue({
      id: "exp-1",
      deletedAt: new Date(),
    });

    const res = await DELETE(jsonRequest(null, "DELETE"), defaultParams);

    expect(res.status).toBe(200);
    expect(mockDb.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it("returns 403 when caller is not the creator", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-2",
      deletedAt: null,
    });

    const res = await DELETE(jsonRequest(null, "DELETE"), defaultParams);
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when expense does not exist", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);
    const res = await DELETE(jsonRequest(null, "DELETE"), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when expense is already soft-deleted", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });
    const res = await DELETE(jsonRequest(null, "DELETE"), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    const res = await DELETE(jsonRequest(null, "DELETE"), defaultParams);
    expect(res.status).toBe(401);
  });
});
