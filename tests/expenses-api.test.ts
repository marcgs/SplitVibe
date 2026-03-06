import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  groupMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  expense: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/groups/grp-1/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultParams = { params: Promise.resolve({ id: "grp-1" }) };

const threeMembers = [
  { userId: "user-1", user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } },
  { userId: "user-2", user: { id: "user-2", name: "Bob", email: "bob@splitvibe.dev" } },
  { userId: "user-3", user: { id: "user-3", name: "Carol", email: "carol@splitvibe.dev" } },
];

// ---------- tests --------------------------------------------------------

describe("POST /api/groups/[id]/expenses", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("creates an expense and returns 201", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.create.mockResolvedValue({
      id: "exp-1",
      description: "Dinner",
      amount: 90,
      currency: "USD",
      splitMode: "EQUAL",
    });

    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1", "user-2", "user-3"],
        date: "2025-06-15",
      }),
      defaultParams
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.description).toBe("Dinner");
  });

  it("splits $90 among 3 members into three $30 rows", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.create.mockResolvedValue({ id: "exp-1" });

    await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1", "user-2", "user-3"],
        date: "2025-06-15",
      }),
      defaultParams
    );

    const createCall = mockDb.expense.create.mock.calls[0][0];
    const splits = createCall.data.splits.create;
    expect(splits).toHaveLength(3);
    expect(splits.every((s: { amount: number }) => s.amount === 30)).toBe(true);
  });

  it("assigns remainder cents to first participants alphabetically", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.create.mockResolvedValue({ id: "exp-1" });

    // $100 / 3 = $33.33 each, remainder 1 cent goes to Alice (alphabetically first)
    await POST(
      jsonRequest({
        title: "Lunch",
        amount: 100,
        paidBy: "user-1",
        splitAmong: ["user-1", "user-2", "user-3"],
        date: "2025-06-15",
      }),
      defaultParams
    );

    const createCall = mockDb.expense.create.mock.calls[0][0];
    const splits = createCall.data.splits.create;
    expect(splits).toHaveLength(3);

    // Sorted alphabetically: Alice, Bob, Carol
    const alice = splits.find((s: { userId: string }) => s.userId === "user-1");
    const bob = splits.find((s: { userId: string }) => s.userId === "user-2");
    const carol = splits.find((s: { userId: string }) => s.userId === "user-3");

    expect(alice.amount).toBe(33.34);
    expect(bob.amount).toBe(33.33);
    expect(carol.amount).toBe(33.33);
  });

  it("creates an ExpensePayer row for the payer", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);
    mockDb.expense.create.mockResolvedValue({ id: "exp-1" });

    await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1", "user-2", "user-3"],
        date: "2025-06-15",
      }),
      defaultParams
    );

    const createCall = mockDb.expense.create.mock.calls[0][0];
    const payers = createCall.data.payers.create;
    expect(payers.userId).toBe("user-1");
    expect(payers.amount).toBe(90);
  });

  it("returns 400 when title is missing", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await POST(
      jsonRequest({
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is not positive", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 0,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when splitAmong is empty", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: [],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const req = new Request("http://localhost/api/groups/grp-1/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, defaultParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when payer is not a group member", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "non-member",
        splitAmong: ["user-1", "user-2"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when split participant is not a group member", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.groupMember.findMany.mockResolvedValue(threeMembers);

    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1", "non-member"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-members", async () => {
    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/groups/[id]/expenses/route");
    const res = await POST(
      jsonRequest({
        title: "Dinner",
        amount: 90,
        paidBy: "user-1",
        splitAmong: ["user-1"],
        date: "2025-06-15",
      }),
      defaultParams
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/groups/[id]/expenses", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("returns expenses for a group member", async () => {
    const { GET } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    const expenses = [
      {
        id: "exp-1",
        description: "Dinner",
        amount: 90,
        currency: "USD",
        date: "2025-06-15T00:00:00.000Z",
        payers: [{ userId: "user-1", amount: 90, user: { id: "user-1", name: "Alice" } }],
        splits: [
          { userId: "user-1", amount: 30, user: { id: "user-1", name: "Alice" } },
          { userId: "user-2", amount: 30, user: { id: "user-2", name: "Bob" } },
          { userId: "user-3", amount: 30, user: { id: "user-3", name: "Carol" } },
        ],
      },
    ];
    mockDb.expense.findMany.mockResolvedValue(expenses);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/expenses"),
      defaultParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].description).toBe("Dinner");
    expect(json[0].payers[0].user.name).toBe("Alice");
  });

  it("returns 403 for non-members", async () => {
    const { GET } = await import("@/app/api/groups/[id]/expenses/route");
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/expenses"),
      defaultParams
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/groups/[id]/expenses/route");
    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/expenses"),
      defaultParams
    );
    expect(res.status).toBe(401);
  });
});
