import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  expense: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  groupMember: {
    findMany: vi.fn(),
  },
  expensePayer: {
    deleteMany: vi.fn(),
  },
  expenseSplit: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb)),
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

// ---------- tests --------------------------------------------------------

describe("PATCH /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
    mockDb.$transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) =>
      cb(mockDb)
    );
  });

  it("updates an expense and returns 200", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.update.mockResolvedValue({ id: "exp-1", description: "Lunch", amount: 60 });

    const res = await PATCH(
      jsonRequest({
        title: "Lunch",
        amount: 60,
        paidBy: "user-1",
        splitAmong: ["user-1", "user-2", "user-3"],
        date: "2025-06-15",
      }),
      defaultParams
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.description).toBe("Lunch");
  });

  it("editing a $90 expense to $60 produces three $20 splits", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.update.mockResolvedValue({ id: "exp-1" });

    await PATCH(
      jsonRequest({
        title: "Dinner",
        amount: 60,
        paidBy: "user-1",
        splitAmong: ["user-1", "user-2", "user-3"],
        date: "2025-06-15",
      }),
      defaultParams
    );

    expect(mockDb.expensePayer.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });
    expect(mockDb.expenseSplit.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: "exp-1" },
    });

    const updateCall = mockDb.expense.update.mock.calls[0][0];
    const splits = updateCall.data.splits.create;
    expect(splits).toHaveLength(3);
    expect(splits.every((s: { amount: number }) => s.amount === 20)).toBe(true);
    expect(updateCall.data.amount).toBe(60);
    expect(updateCall.data.payers.create).toEqual({ userId: "user-1", amount: 60 });
  });

  it("returns 403 when caller is not the creator", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-2",
      deletedAt: null,
    });

    const res = await PATCH(
      jsonRequest({
        title: "Lunch",
        amount: 60,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when expense does not exist", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest({
        title: "Lunch",
        amount: 60,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when expense is already soft-deleted", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });

    const res = await PATCH(
      jsonRequest({
        title: "Lunch",
        amount: 60,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      groupId: "grp-1",
      createdById: "user-1",
      deletedAt: null,
    });

    const res = await PATCH(
      jsonRequest({ title: "", amount: -1, paidBy: "", splitAmong: [], date: "bad" }),
      defaultParams
    );
    expect(res.status).toBe(400);
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
      jsonRequest({
        title: "Lunch",
        amount: 60,
        paidBy: "non-member",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const res = await PATCH(
      jsonRequest({
        title: "Lunch",
        amount: 60,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/expenses/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  function deleteRequest(): Request {
    return new Request("http://localhost/api/expenses/exp-1", { method: "DELETE" });
  }

  it("soft-deletes the expense and returns 200 with deletedAt set", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: null,
    });
    const now = new Date();
    mockDb.expense.update.mockResolvedValue({ id: "exp-1", deletedAt: now });

    const res = await DELETE(deleteRequest(), defaultParams);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deletedAt).toBeTruthy();

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

    const res = await DELETE(deleteRequest(), defaultParams);
    expect(res.status).toBe(403);
    expect(mockDb.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when expense does not exist", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when expense is already soft-deleted", async () => {
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    mockDb.expense.findUnique.mockResolvedValue({
      id: "exp-1",
      createdById: "user-1",
      deletedAt: new Date(),
    });

    const res = await DELETE(deleteRequest(), defaultParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    const res = await DELETE(deleteRequest(), defaultParams);
    expect(res.status).toBe(401);
  });
});
