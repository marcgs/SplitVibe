import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  exchangeRate: { findFirst: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

describe("lib/fx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCachedRate returns 1 when from === to (no DB query)", async () => {
    const { getCachedRate } = await import("@/lib/fx");
    const rate = await getCachedRate("USD", "USD");
    expect(rate).toBe(1);
    expect(mockDb.exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it("getCachedRate returns the latest cached rate as a number", async () => {
    mockDb.exchangeRate.findFirst.mockResolvedValue({ rate: "1.234567" });
    const { getCachedRate } = await import("@/lib/fx");
    const rate = await getCachedRate("EUR", "USD");
    expect(rate).toBeCloseTo(1.234567, 6);
    expect(mockDb.exchangeRate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fromCcy: "EUR", toCcy: "USD" },
        orderBy: { recordedAt: "desc" },
      })
    );
  });

  it("getCachedRate returns null when no row exists", async () => {
    mockDb.exchangeRate.findFirst.mockResolvedValue(null);
    const { getCachedRate } = await import("@/lib/fx");
    const rate = await getCachedRate("EUR", "JPY");
    expect(rate).toBeNull();
  });

  it("startOfUtcDay strips time-of-day", async () => {
    const { startOfUtcDay } = await import("@/lib/fx");
    const d = new Date("2026-04-19T17:42:11.123Z");
    const start = startOfUtcDay(d);
    expect(start.toISOString()).toBe("2026-04-19T00:00:00.000Z");
  });
});
