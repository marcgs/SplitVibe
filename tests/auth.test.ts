import { describe, it, expect, vi } from "vitest";

// Mock modules before importing auth
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("next-auth", () => {
  return {
    default: vi.fn((config: Record<string, unknown>) => ({
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      _config: config,
    })),
  };
});

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn((db: unknown) => ({ db })),
}));

describe("auth configuration", () => {
  it("mock users are available for development login", async () => {
    const { mockUsers } = await import("@/lib/mock-users");
    expect(mockUsers.length).toBeGreaterThan(0);
  });

  it("mock users have dev-only email domain", async () => {
    const { mockUsers } = await import("@/lib/mock-users");
    for (const user of mockUsers) {
      expect(user.email).toMatch(/@splitvibe\.dev$/);
    }
  });

  it("signIn page is configured to /login", async () => {
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock("@/lib/db", () => ({
      db: { user: { upsert: vi.fn() } },
    }));

    vi.doMock("next-auth", () => ({
      default: vi.fn((config: Record<string, unknown>) => ({
        handlers: {},
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        _config: config,
      })),
    }));

    vi.doMock("@auth/prisma-adapter", () => ({
      PrismaAdapter: vi.fn((db: unknown) => ({ db })),
    }));

    await import("@/lib/auth");

    const NextAuth = (await import("next-auth")).default as unknown as ReturnType<typeof vi.fn>;
    const callArgs = NextAuth.mock.calls[0]?.[0] as { pages?: { signIn?: string } } | undefined;
    expect(callArgs?.pages?.signIn).toBe("/login");
  });
});
