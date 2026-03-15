import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const showTestAccounts = process.env.ENABLE_TEST_ACCOUNTS === "true";
  return <LoginForm showTestAccounts={showTestAccounts} />;
}
