import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = { user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  groupMember: { findUnique: vi.fn() },
  expense: { findUnique: vi.fn() },
  attachment: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

vi.mock("@/lib/storage", () => ({
  generateUploadSasUrl: vi.fn().mockResolvedValue({
    uploadUrl: "http://storage:10000/devstoreaccount1/attachments/abc.jpg?sv=2024&sig=fake",
    blobName: "abc.jpg",
  }),
  generateReadSasUrl: vi.fn().mockResolvedValue(
    "http://storage:10000/devstoreaccount1/attachments/abc.jpg?sv=2024&sig=fakeread"
  ),
}));

// ---------- helpers ------------------------------------------------------

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPresignBody = {
  expenseId: "exp-1",
  fileName: "receipt.jpg",
  contentType: "image/jpeg",
  fileSize: 1_000_000,
};

// ---------- tests: POST /api/attachments/presign -------------------------

describe("POST /api/attachments/presign", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("returns a presigned upload URL for a valid request", async () => {
    const { POST } = await import("@/app/api/attachments/presign/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.count.mockResolvedValue(0);

    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", validPresignBody)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("uploadUrl");
    expect(json).toHaveProperty("blobName");
  });

  it("rejects disallowed MIME types with 400", async () => {
    const { POST } = await import("@/app/api/attachments/presign/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.count.mockResolvedValue(0);

    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", {
        ...validPresignBody,
        contentType: "application/zip",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/file type/i);
  });

  it("rejects files larger than 10 MB with 400", async () => {
    const { POST } = await import("@/app/api/attachments/presign/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.count.mockResolvedValue(0);

    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", {
        ...validPresignBody,
        fileSize: 11 * 1024 * 1024,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/10\s*MB/i);
  });

  it("rejects a 6th attachment with 400", async () => {
    const { POST } = await import("@/app/api/attachments/presign/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.count.mockResolvedValue(5);

    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", validPresignBody)
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/5/);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/attachments/presign/route");
    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", validPresignBody)
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a group member", async () => {
    const { POST } = await import("@/app/api/attachments/presign/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", validPresignBody)
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when expense does not exist", async () => {
    const { POST } = await import("@/app/api/attachments/presign/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("http://localhost/api/attachments/presign", validPresignBody)
    );
    expect(res.status).toBe(404);
  });
});

// ---------- tests: POST /api/attachments ---------------------------------

describe("POST /api/attachments", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("saves an attachment reference and returns 201", async () => {
    const { POST } = await import("@/app/api/attachments/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.create.mockResolvedValue({
      id: "att-1",
      expenseId: "exp-1",
      fileName: "receipt.jpg",
      contentType: "image/jpeg",
      blobUrl: "abc.jpg",
      sizeBytes: 1_000_000,
    });

    const res = await POST(
      jsonRequest("http://localhost/api/attachments", {
        expenseId: "exp-1",
        fileName: "receipt.jpg",
        contentType: "image/jpeg",
        blobName: "abc.jpg",
        sizeBytes: 1_000_000,
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("att-1");
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/attachments/route");
    const res = await POST(
      jsonRequest("http://localhost/api/attachments", {
        expenseId: "exp-1",
        fileName: "receipt.jpg",
        contentType: "image/jpeg",
        blobName: "abc.jpg",
        sizeBytes: 1_000_000,
      })
    );
    expect(res.status).toBe(401);
  });
});

// ---------- tests: GET /api/attachments/[id] -----------------------------

describe("GET /api/attachments/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("returns a signed read URL for a valid attachment", async () => {
    const { GET } = await import("@/app/api/attachments/[id]/route");
    mockDb.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      blobUrl: "abc.jpg",
      expense: { groupId: "grp-1" },
    });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await GET(
      new Request("http://localhost/api/attachments/att-1"),
      { params: Promise.resolve({ id: "att-1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("url");
    expect(json.url).toContain("sig=fakeread");
  });

  it("returns 404 when attachment does not exist", async () => {
    const { GET } = await import("@/app/api/attachments/[id]/route");
    mockDb.attachment.findUnique.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/attachments/att-999"),
      { params: Promise.resolve({ id: "att-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a group member", async () => {
    const { GET } = await import("@/app/api/attachments/[id]/route");
    mockDb.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      blobUrl: "abc.jpg",
      expense: { groupId: "grp-1" },
    });
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/attachments/att-1"),
      { params: Promise.resolve({ id: "att-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/attachments/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/attachments/att-1"),
      { params: Promise.resolve({ id: "att-1" }) }
    );
    expect(res.status).toBe(401);
  });
});
