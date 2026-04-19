import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockSession = {
  user: { id: "user-1", name: "Alice", email: "alice@splitvibe.dev" },
};

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

const mockDb = {
  group: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
  exchangeRate: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

// ---------- helpers ------------------------------------------------------

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/fx/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ---------- tests --------------------------------------------------------

describe("POST /api/fx/refresh", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(mockSession as never);
    mockDb.group.findMany.mockResolvedValue([
      { baseCurrency: "USD" },
    ]);
    mockDb.user.findMany.mockResolvedValue([
      { preferredCurrency: "EUR" },
    ]);
    mockDb.expense.findMany.mockResolvedValue([{ currency: "USD" }]);
    mockDb.exchangeRate.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated and no FX_REFRESH_SECRET is set", async () => {
    const authMod = vi.mocked(await import("@/lib/auth"));
    authMod.auth.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/fx/refresh/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(401);
  });

  it("requires the bearer secret when FX_REFRESH_SECRET is set", async () => {
    vi.stubEnv("FX_REFRESH_SECRET", "shh");
    const { POST } = await import("@/app/api/fx/refresh/route");
    const res = await POST(jsonRequest({}, { Authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("fetches Frankfurter rates and upserts ExchangeRate rows", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      const body = u.includes("from=USD")
        ? { base: "USD", date: "2026-04-19", rates: { EUR: 0.92 } }
        : { base: "EUR", date: "2026-04-19", rates: { USD: 1.09 } };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { POST } = await import("@/app/api/fx/refresh/route");
    const res = await POST(jsonRequest({}));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.upserted).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockDb.exchangeRate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fromCcy: "USD",
          toCcy: "EUR",
          rate: 0.92,
          source: "frankfurter",
        }),
      })
    );
  });

  it("records failures but does not crash when Frankfurter returns an error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("nope", { status: 503 }) as unknown as Response
    );

    const { POST } = await import("@/app/api/fx/refresh/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.upserted).toBe(0);
    expect(json.failures.length).toBeGreaterThan(0);
  });
});
