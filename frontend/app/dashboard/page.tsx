"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";

interface KitSummary {
  _id: string;
  status: "draft" | "generating" | "ready" | "failed";
  content?: { source?: { company?: string; role?: string } };
}

export default function DashboardPage() {
  const router = useRouter();
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<KitSummary[]>("/kits")
      .then(setKits)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Couldn't load your kits.";
        if (message.includes("Sign in")) router.push("/login");
        else setError(message);
      });
  }, [router]);

  async function handleLogout() {
    await logout().catch(() => {});
    router.push("/login");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl text-ink">Your prep kits</h1>
        <button onClick={handleLogout} className="text-sm text-muted underline underline-offset-2">
          Sign out
        </button>
      </div>

      <a
        href="/kits/new"
        className="mt-8 inline-block bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90"
      >
        New kit
      </a>

      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}

      {kits === null && !error && <p className="mt-8 text-sm text-muted">Loading…</p>}

      {kits?.length === 0 && (
        <p className="mt-10 max-w-[50ch] text-sm text-muted">
          No kits yet. Paste a job description to generate your first one.
        </p>
      )}

      {kits && kits.length > 0 && (
        <ul className="mt-8 divide-y divide-line border-t border-line">
          {kits.map((kit) => (
            <li key={kit._id}>
              <a
                href={`/kits/${kit._id}`}
                className="flex items-center justify-between py-4 transition hover:bg-black/[0.02]"
              >
                <span className="text-ink">
                  {kit.content?.source?.role || "Untitled role"}
                  {kit.content?.source?.company ? ` at ${kit.content.source.company}` : ""}
                </span>
                <span className="text-sm text-muted">{kit.status}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
