import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));

describe("Login page", () => {
  it("should show Google sign-in and hide mock login in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.queryByText("Select a mock user to sign in")).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  it("should keep mock login available in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();

    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);

    expect(screen.getByText("Dev only")).toBeInTheDocument();
    expect(screen.getByText("alice@splitvibe.dev")).toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  it("should start Google sign-in with the dashboard callback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const user = userEvent.setup();

    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard" });

    vi.unstubAllEnvs();
  });
});
