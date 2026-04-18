import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

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
  expensePayer: {
    deleteMany: vi.fn(),
  },
  expenseSplit: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/expenses/exp-1", {
    method: "PATCH",
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

const validBody = {
  title: "Dinner (edited)",
  amount: 60,
  paidBy: "user-1",
  splitAmong: ["user-1", "user-2", "user-3"],
  date: "2025-06-15",
};

// ---------- tests --------------------------------------------------------

describe("PATCH /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);

    // Default: $transaction invokes the callback with the same mockDb
    mockDb.$transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb));
  });

  it("updates an expense and returns 200", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.update.mockResolvedValue({
      id: "exp-1",
      description: "Dinner (edited)",
      amount: 60,
    });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest(validBody), defaultParams);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.description).toBe("Dinner (edited)");
  });

  it("editing a $90 expense to $60 produces three $20 splits", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.update.mockResolvedValue({ id: "exp-1" });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    await PATCH(jsonRequest({ ...validBody, amount: 60 }), defaultParams);

    expect(mockDb.expensePayer.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    expect(mockDb.expenseSplit.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });

    const updateCall = mockDb.expense.update.mock.calls[0][0];
    const splits = updateCall.data.splits.create as { userId: string; amount: number }[];
    expect(splits).toHaveLength(3);
    expect(splits.every((s) => s.amount === 20)).toBe(true);

    const payer = updateCall.data.payers.create as { userId: string; amount: number };
    expect(payer.userId).toBe("user-1");
    expect(payer.amount).toBe(60);
  });

  it("uses a transaction to atomically replace splits", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.update.mockResolvedValue({ id: "exp-1" });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    await PATCH(jsonRequest(validBody), defaultParams);

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when caller is not the creator", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-2",
      deletedAt: null,
    });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the expense does not exist", async () => {
    mockDb.expense.findUnique.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the expense is already soft-deleted", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(jsonRequest(validBody), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when title is missing", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const { title: _omit, ...rest } = validBody;
    const res = await PATCH(jsonRequest(rest), defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when payer is not a group member", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(
      jsonRequest({ ...validBody, paidBy: "non-member" }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
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

describe("DELETE /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("soft-deletes the expense by setting deletedAt", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.expense.update.mockResolvedValue({
      id: "exp-1",
      deletedAt: new Date(),
    });

    const { DELETE } = await import("@/app/api/expenses/[id]/route");
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

  it("returns 403 when caller is not the creator", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-2",
      deletedAt: null,
    });

    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the expense does not exist", async () => {
    mockDb.expense.findUnique.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" }),
      defaultParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the expense is already deleted", async () => {
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });

    const { DELETE } = await import("@/app/api/expenses/[id]/route");
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
