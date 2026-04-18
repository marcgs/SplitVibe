import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = {
  user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" },
};

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockTx = {
  expensePayer: { deleteMany: vi.fn() },
  expenseSplit: { deleteMany: vi.fn() },
  expense: { update: vi.fn() },
};

const mockDb = {
  groupMember: { findMany: vi.fn() },
  expense: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(
    async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)
  ),
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown, method: string = "PATCH"): Request {
  return new Request("http://localhost/api/expenses/exp-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultParams = { params: Promise.resolve({ id: "exp-1" }) };

const threeMembers = [
  {
    userId: "user-1",
    user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" },
  },
  {
    userId: "user-2",
    user: { id: "user-2", name: "Bob", email: "bob@splitvibe.dev" },
  },
  {
    userId: "user-3",
    user: { id: "user-3", name: "Carol", email: "carol@splitvibe.dev" },
  },
];

const validBody = {
  title: "Dinner",
  amount: 60,
  paidBy: "user-1",
  splitAmong: ["user-1", "user-2", "user-3"],
  date: "2025-06-15",
};

// ---------- PATCH tests --------------------------------------------------

describe("PATCH /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
    mockDb.$transaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)
    );
  });

  it("updates the expense and recomputes splits when creator edits", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockTx.expense.update.mockResolvedValue({
      id: "exp-1",
      description: "Dinner",
      amount: 60,
    });

    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(200);

    expect(mockTx.expensePayer.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    expect(mockTx.expenseSplit.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });

    const updateCall = mockTx.expense.update.mock.calls[0][0];
    const splits = updateCall.data.splits.create;
    expect(splits).toHaveLength(3);
    expect(splits.every((s: { amount: number }) => s.amount === 20)).toBe(true);
    expect(updateCall.data.payers.create).toEqual({
      userId: "user-1",
      amount: 60,
    });
    expect(updateCall.data.amount).toBe(60);
    expect(updateCall.data.description).toBe("Dinner");
  });

  it("uses a transaction so split replacement is atomic", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockTx.expense.update.mockResolvedValue({ id: "exp-1" });

    await PATCH(jsonRequest(validBody), defaultParams);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when a non-creator tries to edit", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-2",
      deletedAt: null,
    });

    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(403);
    expect(mockTx.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the expense does not exist", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the expense is already soft-deleted", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });

    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when payer is not a group member", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await PATCH(
      jsonRequest({ ...validBody, paidBy: "non-member" }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when validation fails", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });

    const res = await PATCH(
      jsonRequest({ ...validBody, amount: -1 }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });

    const req = new Request("http://localhost/api/expenses/exp-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");

    const res = await PATCH(jsonRequest(validBody), defaultParams);
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

  it("soft-deletes the expense by setting deletedAt", async () => {
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

    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );

    expect(res.status).toBe(200);
    expect(mockDb.expense.update).toHaveBeenCalledWith({
      where: { id: "exp-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns 403 when a non-creator tries to delete", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-2",
      deletedAt: null,
    });

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
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });

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
