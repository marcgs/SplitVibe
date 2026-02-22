"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { mockUsers } from "@/lib/mock-users";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleLogin(email: string) {
    setLoading(true);
    await signIn("credentials", { email, callbackUrl: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">SplitVibe</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Select a mock user to sign in
          </p>
        </div>

        <div className="space-y-3">
          {mockUsers.map((user) => (
            <button
              key={user.id}
              disabled={loading}
              onClick={() => handleLogin(user.email)}
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

        {loading && (
          <p className="text-center text-sm text-zinc-500">Signing in…</p>
        )}
      </div>
    </div>
  );
}
