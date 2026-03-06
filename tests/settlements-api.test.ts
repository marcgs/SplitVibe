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
  settlement: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultGroupParams = { params: Promise.resolve({ id: "grp-1" }) };
const defaultSettlementParams = { params: Promise.resolve({ id: "stl-1" }) };

/** Helper to mimic Prisma Decimal */
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) };
}

// ---------- POST /api/groups/[id]/settlements tests ----------------------

describe("POST /api/groups/[id]/settlements", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("creates a settlement and returns 201", async () => {
    const { POST } = await import("@/app/api/groups/[id]/settlements/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.settlement.create.mockResolvedValue({
      id: "stl-1",
      groupId: "grp-1",
      payerId: "user-1",
      payeeId: "user-3",
      amount: decimal(20),
      currency: "USD",
      date: new Date("2025-06-15"),
      createdAt: new Date(),
    });

    const res = await POST(
      jsonRequest("http://localhost/api/groups/grp-1/settlements", {
        payerId: "user-1",
        payeeId: "user-3",
        amount: 20,
        currency: "USD",
        date: "2025-06-15",
      }),
      defaultGroupParams
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("stl-1");
  });

  it("returns 400 when amount is not positive", async () => {
    const { POST } = await import("@/app/api/groups/[id]/settlements/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await POST(
      jsonRequest("http://localhost/api/groups/grp-1/settlements", {
        payerId: "user-1",
        payeeId: "user-3",
        amount: 0,
        currency: "USD",
        date: "2025-06-15",
      }),
      defaultGroupParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when payerId and payeeId are the same", async () => {
    const { POST } = await import("@/app/api/groups/[id]/settlements/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await POST(
      jsonRequest("http://localhost/api/groups/grp-1/settlements", {
        payerId: "user-1",
        payeeId: "user-1",
        amount: 20,
        currency: "USD",
        date: "2025-06-15",
      }),
      defaultGroupParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-members", async () => {
    const { POST } = await import("@/app/api/groups/[id]/settlements/route");
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("http://localhost/api/groups/grp-1/settlements", {
        payerId: "user-1",
        payeeId: "user-3",
        amount: 20,
        currency: "USD",
        date: "2025-06-15",
      }),
      defaultGroupParams
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/groups/[id]/settlements/route");
    const res = await POST(
      jsonRequest("http://localhost/api/groups/grp-1/settlements", {
        payerId: "user-1",
        payeeId: "user-3",
        amount: 20,
        currency: "USD",
        date: "2025-06-15",
      }),
      defaultGroupParams
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("@/app/api/groups/[id]/settlements/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const req = new Request("http://localhost/api/groups/grp-1/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, defaultGroupParams);
    expect(res.status).toBe(400);
  });
});

// ---------- DELETE /api/settlements/[id] tests ---------------------------

describe("DELETE /api/settlements/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("soft-deletes a settlement within 24h and returns 200", async () => {
    const { DELETE } = await import("@/app/api/settlements/[id]/route");
    const recentCreatedAt = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    mockDb.settlement.findUnique.mockResolvedValue({
      id: "stl-1",
      groupId: "grp-1",
      payerId: "user-1",
      payeeId: "user-3",
      amount: decimal(20),
      currency: "USD",
      createdAt: recentCreatedAt,
      deletedAt: null,
    });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.settlement.update.mockResolvedValue({ id: "stl-1", deletedAt: new Date() });

    const res = await DELETE(
      new Request("http://localhost/api/settlements/stl-1", { method: "DELETE" }),
      defaultSettlementParams
    );
    expect(res.status).toBe(200);

    // Verify soft-delete: update called with deletedAt
    expect(mockDb.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stl-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it("returns 403 when settlement is older than 24h", async () => {
    const { DELETE } = await import("@/app/api/settlements/[id]/route");
    const oldCreatedAt = new Date(Date.now() - 1000 * 60 * 60 * 25); // 25 hours ago
    mockDb.settlement.findUnique.mockResolvedValue({
      id: "stl-1",
      groupId: "grp-1",
      payerId: "user-1",
      payeeId: "user-3",
      amount: decimal(20),
      currency: "USD",
      createdAt: oldCreatedAt,
      deletedAt: null,
    });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await DELETE(
      new Request("http://localhost/api/settlements/stl-1", { method: "DELETE" }),
      defaultSettlementParams
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when settlement does not exist", async () => {
    const { DELETE } = await import("@/app/api/settlements/[id]/route");
    mockDb.settlement.findUnique.mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/settlements/stl-1", { method: "DELETE" }),
      defaultSettlementParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when settlement is already deleted", async () => {
    const { DELETE } = await import("@/app/api/settlements/[id]/route");
    mockDb.settlement.findUnique.mockResolvedValue({
      id: "stl-1",
      groupId: "grp-1",
      payerId: "user-1",
      payeeId: "user-3",
      amount: decimal(20),
      currency: "USD",
      createdAt: new Date(Date.now() - 1000 * 60 * 30),
      deletedAt: new Date(), // already deleted
    });

    const res = await DELETE(
      new Request("http://localhost/api/settlements/stl-1", { method: "DELETE" }),
      defaultSettlementParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-member tries to delete", async () => {
    const { DELETE } = await import("@/app/api/settlements/[id]/route");
    const recentCreatedAt = new Date(Date.now() - 1000 * 60 * 60);
    mockDb.settlement.findUnique.mockResolvedValue({
      id: "stl-1",
      groupId: "grp-1",
      payerId: "user-1",
      payeeId: "user-3",
      amount: decimal(20),
      currency: "USD",
      createdAt: recentCreatedAt,
      deletedAt: null,
    });
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/settlements/stl-1", { method: "DELETE" }),
      defaultSettlementParams
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { DELETE } = await import("@/app/api/settlements/[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/settlements/stl-1", { method: "DELETE" }),
      defaultSettlementParams
    );
    expect(res.status).toBe(401);
  });
});
