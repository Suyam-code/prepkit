"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Kit, Question, Flashcard } from "@prepkit/shared";

interface KitDoc {
  _id: string;
  status: "draft" | "generating" | "ready" | "failed";
  content: Kit;
}

const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

const CATEGORY_ORDER = ["technical", "system-design", "behavioural", "company-fit"];

export default function KitPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [kit, setKit] = useState<KitDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    api<KitDoc>(`/kits/${params.id}`)
      .then(setKit)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Couldn't load this kit.";
        if (message.includes("Sign in")) router.push("/login");
        else setError(message);
      });
  }, [params.id, router]);

  async function saveQuestion(qid: string, updates: { prompt?: string; answer_outline?: string }) {
    if (!kit) return;
    try {
      const updated = await api<KitDoc>(`/kits/${kit._id}/questions/${qid}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setKit(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your edit.");
    }
  }

  async function saveFlashcard(fid: string, updates: { front?: string; back?: string }) {
    if (!kit) return;
    try {
      const updated = await api<KitDoc>(`/kits/${kit._id}/flashcards/${fid}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setKit(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your edit.");
    }
  }

  async function togglePin(kind: "questions" | "flashcards", id: string, currentState: string) {
    if (!kit) return;
    const action = currentState === "pinned" ? "unpin" : "pin";
    try {
      const updated = await api<KitDoc>(`/kits/${kit._id}/${kind}/${id}/${action}`, { method: "POST" });
      setKit(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that.");
    }
  }

  async function moveQuestion(qid: string, direction: "up" | "down") {
    if (!kit) return;
    try {
      const updated = await api<KitDoc>(`/kits/${kit._id}/questions/${qid}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      });
      setKit(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reorder.");
    }
  }

  async function moveFlashcard(fid: string, direction: "up" | "down") {
    if (!kit) return;
    try {
      const updated = await api<KitDoc>(`/kits/${kit._id}/flashcards/${fid}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      });
      setKit(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reorder.");
    }
  }

  async function regenerateSection(section: string) {
    if (!kit) return;
    setRegenerating(section);
    try {
      const updated = await api<KitDoc>(`/kits/${kit._id}/regenerate/${section}`, { method: "POST" });
      setKit(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't regenerate this section.");
    } finally {
      setRegenerating(null);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!kit) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (kit.status === "failed") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-serif text-3xl text-ink">Generation failed</h1>
        <p className="mt-2 max-w-[50ch] text-muted">
          Something went wrong building this kit — the company site may be unreachable, or the
          job description too short to work with. Try creating a new one.
        </p>
        <a href="/kits/new" className="mt-6 inline-block text-sm text-ink underline underline-offset-2">
          Start a new kit
        </a>
      </main>
    );
  }

  const { content } = kit;

  const questionsByCategory = new Map<string, Question[]>();
  for (const q of content.questions) {
    const list = questionsByCategory.get(q.category) ?? [];
    list.push(q);
    questionsByCategory.set(q.category, list);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/dashboard" className="text-sm text-muted underline underline-offset-2">
        All kits
      </a>

      <p className="mt-6 text-sm text-muted">{content.source.company}</p>
      <h1 className="font-serif text-3xl text-ink">{content.role.title}</h1>
      <p className="mt-1 text-sm text-muted">{content.role.seniority}</p>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-serif text-xl text-ink">About the company</h2>
        <p className="mt-2 max-w-[65ch] text-ink/90">{content.company_brief.summary}</p>
        {content.company_brief.what_they_do && (
          <p className="mt-2 max-w-[65ch] text-ink/90">{content.company_brief.what_they_do}</p>
        )}
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-serif text-xl text-ink">What they&apos;re looking for</h2>
        {content.role.requirements.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-muted">A darker line on the left marks a must-have.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {content.role.requirements.map((r) => (
                <li
                  key={r.id}
                  className={`border-l-2 py-1 pl-3 text-sm text-ink/90 ${
                    r.priority === "must" ? "border-accent" : "border-line"
                  }`}
                >
                  {r.text}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No specific requirements could be pulled from this job description — try pasting a
            fuller one for a richer kit.
          </p>
        )}
      </section>

      {questionsByCategory.size === 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <p className="text-sm text-muted">
            No questions could be generated — the job description may be too thin, or no company
            information was found. Try a fuller job description.
          </p>
        </section>
      )}

      {CATEGORY_ORDER.filter((c) => questionsByCategory.has(c)).map((category) => (
        <section key={category} className="mt-10 border-t border-line pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl text-ink">{CATEGORY_LABEL[category] ?? category}</h2>
            <button
              onClick={() => regenerateSection(category)}
              disabled={regenerating === category}
              title="Keeps anything you've edited or pinned in this section; only replaces the rest"
              className="text-xs text-muted underline underline-offset-2 disabled:opacity-50"
            >
              {regenerating === category ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
          <ol className="mt-4 flex flex-col gap-6">
            {questionsByCategory.get(category)!.map((q, i, arr) => (
              <QuestionItem
                key={q.id}
                question={q}
                isFirst={i === 0}
                isLast={i === arr.length - 1}
                onSave={(updates) => saveQuestion(q.id, updates)}
                onTogglePin={() => togglePin("questions", q.id, q.state)}
                onMove={(direction) => moveQuestion(q.id, direction)}
              />
            ))}
          </ol>
        </section>
      ))}

      {content.flashcards.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl text-ink">Flashcards</h2>
            <div className="flex items-center gap-4">
              <a href={`/kits/${kit._id}/practice`} className="text-xs text-ink underline underline-offset-2">
                Practice
              </a>
              <button
                onClick={() => regenerateSection("flashcards")}
                disabled={regenerating === "flashcards"}
                title="Keeps anything you've edited or pinned; only replaces the rest"
                className="text-xs text-muted underline underline-offset-2 disabled:opacity-50"
              >
                {regenerating === "flashcards" ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>
          <dl className="mt-4 flex flex-col gap-4">
            {content.flashcards.map((c, i, arr) => (
              <FlashcardItem
                key={c.id}
                card={c}
                isFirst={i === 0}
                isLast={i === arr.length - 1}
                onSave={(updates) => saveFlashcard(c.id, updates)}
                onTogglePin={() => togglePin("flashcards", c.id, c.state)}
                onMove={(direction) => moveFlashcard(c.id, direction)}
              />
            ))}
          </dl>
        </section>
      )}

      <section className="mt-10 border-t border-line pb-24 pt-6">
        <h2 className="font-serif text-xl text-ink">Study schedule</h2>
        <ol className="mt-4 flex flex-col gap-4">
          {content.schedule.days.map((day) => (
            <li key={day.day} className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Day {day.day}</p>
                <p className="text-ink">{day.focus}</p>
              </div>
              {day.minutes > 0 && (
                <p className="whitespace-nowrap text-sm text-muted">
                  {day.minutes} min, {day.question_ids.length} questions
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function StateTag({ state }: { state: string }) {
  if (state === "generated") return null;
  return <span className="text-xs text-muted">{state}</span>;
}

function QuestionItem({
  question,
  isFirst,
  isLast,
  onSave,
  onTogglePin,
  onMove,
}: {
  question: Question;
  isFirst: boolean;
  isLast: boolean;
  onSave: (updates: { prompt?: string; answer_outline?: string }) => void;
  onTogglePin: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);
  const [answerOutline, setAnswerOutline] = useState(question.answer_outline);

  useEffect(() => {
    setPrompt(question.prompt);
    setAnswerOutline(question.answer_outline);
  }, [question.prompt, question.answer_outline]);

  function handleSave() {
    onSave({ prompt, answer_outline: answerOutline });
    setEditing(false);
  }

  function handleCancel() {
    setPrompt(question.prompt);
    setAnswerOutline(question.answer_outline);
    setEditing(false);
  }

  return (
    <li>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {editing ? (
            <>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                className="w-full border border-line bg-white/60 p-2 text-sm text-ink outline-none focus:border-ink"
              />
              <textarea
                value={answerOutline}
                onChange={(e) => setAnswerOutline(e.target.value)}
                rows={3}
                className="mt-2 w-full border border-line bg-white/60 p-2 text-sm text-muted outline-none focus:border-ink"
              />
              <div className="mt-2 flex gap-3">
                <button onClick={handleSave} className="text-xs text-ink underline underline-offset-2">
                  Save
                </button>
                <button onClick={handleCancel} className="text-xs text-muted underline underline-offset-2">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-ink">{question.prompt}</p>
              <p className="mt-1.5 max-w-[65ch] text-sm text-muted">{question.answer_outline}</p>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <StateTag state={question.state} />
            <div className="flex gap-2">
              <button
                onClick={() => onMove("up")}
                disabled={isFirst}
                className="text-xs text-muted underline underline-offset-2 disabled:opacity-30"
              >
                Up
              </button>
              <button
                onClick={() => onMove("down")}
                disabled={isLast}
                className="text-xs text-muted underline underline-offset-2 disabled:opacity-30"
              >
                Down
              </button>
              <button onClick={() => setEditing(true)} className="text-xs text-muted underline underline-offset-2">
                Edit
              </button>
              <button onClick={onTogglePin} className="text-xs text-muted underline underline-offset-2">
                {question.state === "pinned" ? "Unpin" : "Pin"}
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function FlashcardItem({
  card,
  isFirst,
  isLast,
  onSave,
  onTogglePin,
  onMove,
}: {
  card: Flashcard;
  isFirst: boolean;
  isLast: boolean;
  onSave: (updates: { front?: string; back?: string }) => void;
  onTogglePin: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);

  useEffect(() => {
    setFront(card.front);
    setBack(card.back);
  }, [card.front, card.back]);

  function handleSave() {
    onSave({ front, back });
    setEditing(false);
  }

  function handleCancel() {
    setFront(card.front);
    setBack(card.back);
    setEditing(false);
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        {editing ? (
          <>
            <input
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="w-full border-b border-line bg-transparent py-1 text-ink outline-none focus:border-ink"
            />
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              rows={2}
              className="mt-2 w-full border border-line bg-white/60 p-2 text-sm text-muted outline-none focus:border-ink"
            />
            <div className="mt-2 flex gap-3">
              <button onClick={handleSave} className="text-xs text-ink underline underline-offset-2">
                Save
              </button>
              <button onClick={handleCancel} className="text-xs text-muted underline underline-offset-2">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-ink">{card.front}</p>
            <p className="mt-1 max-w-[65ch] text-sm text-muted">{card.back}</p>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StateTag state={card.state} />
          <div className="flex gap-2">
            <button
              onClick={() => onMove("up")}
              disabled={isFirst}
              className="text-xs text-muted underline underline-offset-2 disabled:opacity-30"
            >
              Up
            </button>
            <button
              onClick={() => onMove("down")}
              disabled={isLast}
              className="text-xs text-muted underline underline-offset-2 disabled:opacity-30"
            >
              Down
            </button>
            <button onClick={() => setEditing(true)} className="text-xs text-muted underline underline-offset-2">
              Edit
            </button>
            <button onClick={onTogglePin} className="text-xs text-muted underline underline-offset-2">
              {card.state === "pinned" ? "Unpin" : "Pin"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
