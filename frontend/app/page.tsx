export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="font-serif text-4xl text-ink">Interview Prep Kit</h1>
      <p className="mt-3 max-w-[50ch] text-ink/80">
        Paste a job description and a company&apos;s site. Get back a study plan built around
        what they&apos;re actually looking for.
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="/login"
          className="bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90"
        >
          Sign in
        </a>
        <a
          href="/register"
          className="border border-ink px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-black/[0.03]"
        >
          Create account
        </a>
      </div>
    </main>
  );
}
