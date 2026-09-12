"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Kit, Flashcard } from "@prepkit/shared";

interface PracticeRecord {
  seen: number;
  lastConfidence: number;
  lastSeenAt: string;
}

interface KitDoc {
  _id: string;
  status: "draft" | "generating" | "ready" | "failed";
  content: Kit;
  practice: Record<string, PracticeRecord>;
}

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "Didn't know it",
  2: "Shaky",
  3: "Okay",
  4: "Good",
  5: "Nailed it",
};

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [kit, setKit] = useState<KitDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionRatings, setSessionRatings] = useState<number[]>([]);

  useEffect(() => {
    api<KitDoc>(`/kits/${params.id}`)
      .then((data) => {
        setKit(data);
        const practice = data.practice ?? {};
        // Weakest / never-seen cards first: no practice record counts as
        // confidence 0, lower than any real rating, so it sorts first.
        const sorted = [...data.content.flashcards].sort((a, b) => {
          const confA = practice[a.id]?.lastConfidence ?? 0;
          const confB = practice[b.id]?.lastConfidence ?? 0;
          return confA - confB;
        });
        setOrder(sorted);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Couldn't load this kit.";
        if (message.includes("Sign in")) router.push("/login");
        else setError(message);
      });
  }, [params.id, router]);

  const current = order[index];
  const done = order.length > 0 && index >= order.length;

  const averageRating = useMemo(() => {
    if (sessionRatings.length === 0) return null;
    return (sessionRatings.reduce((a, b) => a + b, 0) / sessionRatings.length).toFixed(1);
  }, [sessionRatings]);

  async function rate(confidence: number) {
    if (!kit || !current) return;
    setSessionRatings((prev) => [...prev, confidence]);
    try {
      await api(`/kits/${kit._id}/practice/${current.id}`, {
        method: "POST",
        body: JSON.stringify({ confidence }),
      });
    } catch {
      // Non-fatal for the session itself — the rating just won't be saved.
      // Don't block the user's practice flow over a transient save failure.
    }
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <p className="text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!kit) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (order.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <a href={`/kits/${kit._id}`} className="text-sm text-muted underline underline-offset-2">
          Back to kit
        </a>
        <p className="mt-8 text-sm text-muted">This kit has no flashcards yet.</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-serif text-3xl text-ink">Session complete</h1>
        <p className="mt-2 text-ink/90">
          Reviewed {sessionRatings.length} card{sessionRatings.length === 1 ? "" : "s"}
          {averageRating ? `, average confidence ${averageRating} / 5` : ""}.
        </p>
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => {
              setIndex(0);
              setSessionRatings([]);
            }}
            className="bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90"
          >
            Practice again
          </button>
          <a
            href={`/kits/${kit._id}`}
            className="border border-ink px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-black/[0.03]"
          >
            Back to kit
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="flex items-baseline justify-between">
        <a href={`/kits/${kit._id}`} className="text-sm text-muted underline underline-offset-2">
          Back to kit
        </a>
        <p className="text-sm text-muted">
          {index + 1} / {order.length}
        </p>
      </div>

      <div className="mt-10 min-h-[220px] border border-line p-8">
        <p className="text-lg text-ink">{current.front}</p>
        {revealed && <p className="mt-6 max-w-[55ch] text-ink/80">{current.back}</p>}
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="mt-6 bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90"
        >
          Show answer
        </button>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-muted">How well did you know it?</p>
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => rate(n)}
                title={CONFIDENCE_LABELS[n]}
                className="flex-1 border border-line py-2.5 text-sm text-ink transition hover:border-ink"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{CONFIDENCE_LABELS[1]}</span>
            <span>{CONFIDENCE_LABELS[5]}</span>
          </div>
        </div>
      )}
    </main>
  );
}
