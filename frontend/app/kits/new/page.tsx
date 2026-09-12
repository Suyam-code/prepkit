"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const kit = await api<{ _id: string }>("/kits", {
        method: "POST",
        body: JSON.stringify({ jd, company_url: companyUrl, days: Number(days) }),
      });
      router.push(`/kits/${kit._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate this kit.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-serif text-3xl text-ink">New prep kit</h1>
      <p className="mt-1 text-sm text-muted">
        Paste the job description and the company&apos;s site. This takes a minute or two to
        generate.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Job description</span>
          <textarea
            required
            rows={10}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            className="resize-y border border-line bg-white/60 p-3 text-sm text-ink outline-none focus:border-ink"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Company URL</span>
          <input
            type="url"
            required
            placeholder="https://company.com"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            className="border-b border-line bg-transparent py-2 text-ink outline-none focus:border-ink"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Days until the interview</span>
          <input
            type="number"
            required
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-24 border-b border-line bg-transparent py-2 text-ink outline-none focus:border-ink"
          />
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-ink py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
        >
          {loading ? "Generating your kit… this can take a minute or two" : "Generate kit"}
        </button>
      </form>
    </main>
  );
}
