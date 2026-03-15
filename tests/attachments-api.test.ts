import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

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
  uploadBlob: vi.fn().mockResolvedValue({ blobName: "abc.jpg" }),
  downloadBlob: vi.fn().mockImplementation(() =>
    Promise.resolve({
      stream: Readable.from(Buffer.from("fake-data")),
      contentType: "image/jpeg",
      contentLength: 9,
    })
  ),
}));

// ---------- helpers ------------------------------------------------------

function makeFile(name: string, type: string, sizeBytes?: number): File {
  const content = sizeBytes ? new ArrayBuffer(sizeBytes) : "file-data";
  const file = new File([content], name, { type });
  // jsdom File lacks .stream() — polyfill it for the upload route
  if (typeof file.stream !== "function") {
    Object.defineProperty(file, "stream", {
      value: () => new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(typeof content === "string" ? Buffer.from(content) : content));
          controller.close();
        },
      }),
    });
  }
  return file;
}

function uploadRequest(expenseId: string, file: File): Request {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("expenseId", expenseId);

  // In jsdom, Request + FormData doesn't round-trip through request.formData()
  // reliably, so we mock formData() on the request directly.
  const req = new Request("http://localhost/api/attachments/upload", {
    method: "POST",
  });
  Object.defineProperty(req, "formData", {
    value: () => Promise.resolve(formData),
  });
  return req;
}

// ---------- tests: POST /api/attachments/upload --------------------------

describe("POST /api/attachments/upload", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("uploads a file and returns 201 with attachment", async () => {
    const { POST } = await import("@/app/api/attachments/upload/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.count.mockResolvedValue(0);
    mockDb.attachment.create.mockResolvedValue({
      id: "att-1",
      expenseId: "exp-1",
      fileName: "receipt.jpg",
      contentType: "image/jpeg",
      blobUrl: "abc.jpg",
      sizeBytes: 1000,
    });

    const file = makeFile("receipt.jpg", "image/jpeg");
    const res = await POST(uploadRequest("exp-1", file));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("att-1");
  });

  it("rejects disallowed MIME types with 400", async () => {
    const { POST } = await import("@/app/api/attachments/upload/route");

    const file = makeFile("malware.zip", "application/zip");
    const res = await POST(uploadRequest("exp-1", file));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/file type/i);
  });

  it("rejects files larger than 10 MB with 400", async () => {
    const { POST } = await import("@/app/api/attachments/upload/route");

    const bigFile = makeFile("big.jpg", "image/jpeg", 11 * 1024 * 1024);
    const res = await POST(uploadRequest("exp-1", bigFile));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/10\s*MB/i);
  });

  it("rejects a 6th attachment with 400", async () => {
    const { POST } = await import("@/app/api/attachments/upload/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });
    mockDb.attachment.count.mockResolvedValue(5);

    const file = makeFile("receipt.jpg", "image/jpeg");
    const res = await POST(uploadRequest("exp-1", file));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/5/);
  });

  it("returns 401 when not authenticated", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/attachments/upload/route");
    const file = makeFile("receipt.jpg", "image/jpeg");
    const res = await POST(uploadRequest("exp-1", file));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a group member", async () => {
    const { POST } = await import("@/app/api/attachments/upload/route");
    mockDb.expense.findUnique.mockResolvedValue({ id: "exp-1", groupId: "grp-1" });
    mockDb.groupMember.findUnique.mockResolvedValue(null);

    const file = makeFile("receipt.jpg", "image/jpeg");
    const res = await POST(uploadRequest("exp-1", file));
    expect(res.status).toBe(403);
  });

  it("returns 404 when expense does not exist", async () => {
    const { POST } = await import("@/app/api/attachments/upload/route");
    mockDb.expense.findUnique.mockResolvedValue(null);

    const file = makeFile("receipt.jpg", "image/jpeg");
    const res = await POST(uploadRequest("exp-1", file));
    expect(res.status).toBe(404);
  });
});

// ---------- tests: GET /api/attachments/[id] -----------------------------

describe("GET /api/attachments/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
  });

  it("streams blob data with correct headers for a valid attachment", async () => {
    const { GET } = await import("@/app/api/attachments/[id]/route");
    mockDb.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      fileName: "receipt.jpg",
      blobUrl: "abc.jpg",
      expense: { groupId: "grp-1" },
    });
    mockDb.groupMember.findUnique.mockResolvedValue({ role: "member" });

    const res = await GET(
      new Request("http://localhost/api/attachments/att-1"),
      { params: Promise.resolve({ id: "att-1" }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Length")).toBe("9");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="receipt.jpg"');
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
      fileName: "receipt.jpg",
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
