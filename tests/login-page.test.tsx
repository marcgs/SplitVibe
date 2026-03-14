import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import LoginForm from "@/app/(auth)/login/login-form";

const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));

describe("Login page", () => {
  it("should show Google sign-in and hide mock login when test accounts disabled", () => {
    render(<LoginForm showTestAccounts={false} />);

    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.queryByText("Select a mock user to sign in")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev only")).not.toBeInTheDocument();
  });

  it("should show mock login buttons when test accounts enabled", () => {
    render(<LoginForm showTestAccounts={true} />);

    expect(screen.getByText("Dev only")).toBeInTheDocument();
    expect(screen.getByText("alice@splitvibe.dev")).toBeInTheDocument();
  });

  it("should start Google sign-in with the dashboard callback", async () => {
    const user = userEvent.setup();

    render(<LoginForm showTestAccounts={false} />);

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard" });
  });
});
