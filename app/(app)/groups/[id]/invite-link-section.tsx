"use client";

import { useEffect, useState } from "react";

export default function InviteLinkSection({
  groupId,
  inviteToken,
}: {
  groupId: string;
  inviteToken: string;
}) {
  const [token, setToken] = useState(inviteToken);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const inviteUrl = origin ? `${origin}/join/${token}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/invite`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.inviteToken);
      }
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-medium">Invite Link</h2>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={inviteUrl}
            className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          />
          <button
            onClick={handleCopy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Anyone with this link can join the group.
          </p>
          <button
            onClick={handleRevoke}
            disabled={regenerating}
            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
          >
            {regenerating ? "Revoking…" : "Revoke & Regenerate"}
          </button>
        </div>
      </div>
    </section>
  );
}
