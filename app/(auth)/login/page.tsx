import LoginForm from "./login-form";

export default function LoginPage() {
  const showTestAccounts = process.env.ENABLE_TEST_ACCOUNTS === "true";
  return <LoginForm showTestAccounts={showTestAccounts} />;
}
