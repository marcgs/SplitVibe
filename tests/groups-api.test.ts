import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  group: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  groupMember: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------- tests --------------------------------------------------------

describe("POST /api/groups", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("creates a group and returns 201", async () => {
    const { POST } = await import("@/app/api/groups/route");
    const created = {
      id: "grp-1",
      name: "Trip",
      description: null,
      members: [{ userId: "user-1", role: "admin", user: { id: "user-1", name: "Alice" } }],
    };
    mockDb.group.create.mockResolvedValue(created);

    const res = await POST(jsonRequest({ name: "Trip" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Trip");
    expect(mockDb.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Trip",
          members: expect.objectContaining({
            create: expect.objectContaining({ userId: "user-1", role: "admin" }),
          }),
        }),
      })
    );
  });

  it("accepts optional description", async () => {
    const { POST } = await import("@/app/api/groups/route");
    mockDb.group.create.mockResolvedValue({ id: "grp-2", name: "Trip", description: "Fun trip" });

    const res = await POST(jsonRequest({ name: "Trip", description: "Fun trip" }));
    expect(res.status).toBe(201);
    expect(mockDb.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Fun trip" }),
      })
    );
  });

  it("returns 400 when name is missing", async () => {
    const { POST } = await import("@/app/api/groups/route");

    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("@/app/api/groups/route");

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/groups/route");
    const res = await POST(jsonRequest({ name: "Trip" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/groups", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("returns user's groups", async () => {
    const { GET } = await import("@/app/api/groups/route");
    const groups = [
      { id: "grp-1", name: "Trip", _count: { members: 2, expenses: 5 } },
    ];
    mockDb.group.findMany.mockResolvedValue(groups);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("Trip");
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/groups/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("GET /api/groups/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("returns group details for a member", async () => {
    const { GET } = await import("@/app/api/groups/[id]/route");
    const group = {
      id: "grp-1",
      name: "Trip",
      members: [{ userId: "user-1", role: "admin", user: { id: "user-1", name: "Alice" } }],
      _count: { members: 1, expenses: 0 },
    };
    mockDb.group.findUnique.mockResolvedValue(group);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1"),
      { params: Promise.resolve({ id: "grp-1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Trip");
  });

  it("returns 404 for non-existent group", async () => {
    const { GET } = await import("@/app/api/groups/[id]/route");
    mockDb.group.findUnique.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/groups/nope"),
      { params: Promise.resolve({ id: "nope" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-member", async () => {
    const { GET } = await import("@/app/api/groups/[id]/route");
    const group = {
      id: "grp-1",
      name: "Trip",
      members: [{ userId: "other-user", role: "admin" }],
    };
    mockDb.group.findUnique.mockResolvedValue(group);

    const res = await GET(
      new Request("http://localhost/api/groups/grp-1"),
      { params: Promise.resolve({ id: "grp-1" }) }
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/groups/[id]/invite", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("generates a new invite token for admin", async () => {
    const { POST } = await import("@/app/api/groups/[id]/invite/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "admin" });
    mockDb.group.update.mockResolvedValue({ id: "grp-1", inviteToken: "new-token" });

    const res = await POST(
      new Request("http://localhost/api/groups/grp-1/invite", { method: "POST" }),
      { params: Promise.resolve({ id: "grp-1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.inviteToken).toBe("new-token");
  });

  it("returns 403 for non-admin member", async () => {
    const { POST } = await import("@/app/api/groups/[id]/invite/route");
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await POST(
      new Request("http://localhost/api/groups/grp-1/invite", { method: "POST" }),
      { params: Promise.resolve({ id: "grp-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when user is not a member", async () => {
    const { POST } = await import("@/app/api/groups/[id]/invite/route");
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/groups/grp-1/invite", { method: "POST" }),
      { params: Promise.resolve({ id: "grp-1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/groups/[id]/invite/route");
    const res = await POST(
      new Request("http://localhost/api/groups/grp-1/invite", { method: "POST" }),
      { params: Promise.resolve({ id: "grp-1" }) }
    );
    expect(res.status).toBe(401);
  });
});
