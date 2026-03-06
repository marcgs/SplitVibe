import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("Root page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should redirect authenticated users to /dashboard", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const { default: Home } = await import("@/app/page");
    await Home();

    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("should redirect unauthenticated users to /login", async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import("@/app/page");
    await Home();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("should redirect to /login when session has no user", async () => {
    mockAuth.mockResolvedValue({});

    const { default: Home } = await import("@/app/page");
    await Home();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
