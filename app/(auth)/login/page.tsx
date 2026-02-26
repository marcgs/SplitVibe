"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { mockUsers } from "@/lib/mock-users";

const isDev = process.env.NODE_ENV === "development";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleMockLogin(email: string) {
    setLoading(true);
    await signIn("credentials", { email, callbackUrl: "/dashboard" });
  }

  async function handleGoogleLogin() {
    setLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">SplitVibe</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to continue
          </p>
        </div>

        <div className="space-y-3">
          <button
            disabled={loading}
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-zinc-200 px-4 py-3 text-sm font-medium transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </div>

        {isDev && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                  Dev only
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {mockUsers.map((user) => (
                <button
                  key={user.id}
                  disabled={loading}
                  onClick={() => handleMockLogin(user.email)}
                  className="flex w-full items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.image}
                    alt={user.name}
                    className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800"
                  />
                  <div>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {user.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {loading && (
          <p className="text-center text-sm text-zinc-500">Signing in…</p>
        )}
      </div>
    </div>
  );
}
