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

  it("includes Google provider when credentials are set", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "test-google-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "test-google-secret");
    vi.resetModules();

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
    const callArgs = NextAuth.mock.calls[0]?.[0] as {
      providers?: Array<{ id?: string; name?: string; type?: string }>;
    } | undefined;
    const providers = callArgs?.providers ?? [];
    const googleProvider = providers.find(
      (p) => p.id === "google" || p.name === "Google"
    );
    expect(googleProvider).toBeDefined();

    vi.unstubAllEnvs();
  });

  it("excludes Google provider when credentials are missing", async () => {
    vi.resetModules();

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
    const callArgs = NextAuth.mock.calls[0]?.[0] as {
      providers?: Array<{ id?: string; name?: string; type?: string }>;
    } | undefined;
    const providers = callArgs?.providers ?? [];
    const googleProvider = providers.find(
      (p) => p.id === "google" || p.name === "Google"
    );
    expect(googleProvider).toBeUndefined();
  });

  it("includes mock credentials provider in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();

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
    const callArgs = NextAuth.mock.calls[0]?.[0] as {
      providers?: Array<{ id?: string; name?: string; type?: string }>;
    } | undefined;
    const providers = callArgs?.providers ?? [];
    const credentialsProvider = providers.find(
      (p) => p.id === "credentials" || p.type === "credentials"
    );
    expect(credentialsProvider).toBeDefined();

    vi.unstubAllEnvs();
  });
});
