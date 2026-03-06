import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  groupMember: {
    findUnique: vi.fn(),
  },
  expense: {
    findMany: vi.fn(),
  },
  settlement: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

const defaultParams = { params: Promise.resolve({ id: "grp-1" }) };

/** Helper to mimic Prisma Decimal (has valueOf for Number() conversion) */
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) };
}

// ---------- tests --------------------------------------------------------

describe("GET /api/groups/[id]/balances", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("returns balances and simplified debts for a group member", async () => {
    const { GET } = await import("@/app/api/groups/[id]/balances/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    mockDb.expense.findMany.mockResolvedValue([
      {
        payers: [{ userId: "user-1", amount: decimal(90) }],
        splits: [
          { userId: "user-1", amount: decimal(30) },
          { userId: "user-2", amount: decimal(30) },
          { userId: "user-3", amount: decimal(30) },
        ],
      },
    ]);
    mockDb.settlement.findMany.mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/balances"),
      defaultParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.balances).toBeDefined();
    expect(json.simplifiedDebts).toBeDefined();

    // Alice should be owed 60
    const aliceBalance = json.balances.find(
      (b: { userId: string }) => b.userId === "user-1"
    );
    expect(aliceBalance.amount).toBe(60);

    // Bob and Carol each owe 30
    const bobBalance = json.balances.find(
      (b: { userId: string }) => b.userId === "user-2"
    );
    expect(bobBalance.amount).toBe(-30);
  });

  it("accounts for settlements in balance calculation", async () => {
    const { GET } = await import("@/app/api/groups/[id]/balances/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    mockDb.expense.findMany.mockResolvedValue([
      {
        payers: [{ userId: "user-1", amount: decimal(60) }],
        splits: [
          { userId: "user-1", amount: decimal(30) },
          { userId: "user-2", amount: decimal(30) },
        ],
      },
    ]);
    mockDb.settlement.findMany.mockResolvedValue([
      {
        payerId: "user-2",
        payeeId: "user-1",
        amount: decimal(30),
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/balances"),
      defaultParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // After settlement, both should be 0
    const aliceBalance = json.balances.find(
      (b: { userId: string }) => b.userId === "user-1"
    );
    expect(aliceBalance.amount).toBe(0);
    const bobBalance = json.balances.find(
      (b: { userId: string }) => b.userId === "user-2"
    );
    expect(bobBalance.amount).toBe(0);

    // No simplified debts since everything is settled
    expect(json.simplifiedDebts).toHaveLength(0);
  });

  it("returns 403 for non-members", async () => {
    const { GET } = await import("@/app/api/groups/[id]/balances/route");
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/balances"),
      defaultParams
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/groups/[id]/balances/route");
    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/balances"),
      defaultParams
    );
    expect(res.status).toBe(401);
  });

  it("returns empty results when group has no expenses", async () => {
    const { GET } = await import("@/app/api/groups/[id]/balances/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.expense.findMany.mockResolvedValue([]);
    mockDb.settlement.findMany.mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1/balances"),
      defaultParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.balances).toEqual([]);
    expect(json.simplifiedDebts).toEqual([]);
  });
});
