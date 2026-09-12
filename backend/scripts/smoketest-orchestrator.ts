import "dotenv/config";
import { runOrchestrator } from "../src/pipeline/orchestrator";

const jd = `
Senior Backend Engineer — Payments Team

We're looking for a Senior Backend Engineer to join our Payments team.
You'll design and build services handling millions of transactions per day.

Requirements:
- 5+ years building production backend systems in Go, Java, or similar
- Deep understanding of distributed systems and eventual consistency
- Experience with PostgreSQL or another relational database at scale
- Track record of mentoring more junior engineers
- Nice to have: experience with payment processing or financial systems
- Nice to have: familiarity with Kafka or similar event streaming systems

You'll work closely with product and compliance teams, and need to
communicate complex technical tradeoffs clearly to non-technical stakeholders.
`;

async function main() {
  const start = Date.now();
  const kit = await runOrchestrator({
    jd,
    company_url: "https://stripe.com",
    days: 5,
  });
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Generated in ${seconds}s\n`);
  console.log("=== source ===");
  console.log(kit.source);
  console.log("\n=== company_brief ===");
  console.log(kit.company_brief);
  console.log(`\n=== requirements (${kit.role.requirements.length}) ===`);
  kit.role.requirements.forEach((r) => console.log(`[${r.id}] (${r.kind}/${r.priority}) ${r.text}`));
  console.log(`\n=== coverage ===`);
  console.log(kit.coverage);
  console.log(`\n=== questions (${kit.questions.length}) ===`);
  kit.questions.forEach((q) => console.log(`[${q.id}] (${q.category}) ${q.prompt}`));
  console.log(`\n=== flashcards (${kit.flashcards.length}) ===`);
  kit.flashcards.forEach((c) => console.log(`[${c.id}] ${c.front} -> ${c.back}`));
  console.log(`\n=== schedule (${kit.schedule.days_available} days) ===`);
  kit.schedule.days.forEach((d) => console.log(`Day ${d.day} (${d.minutes}min, "${d.focus}"): ${d.question_ids.join(", ") || "(none)"}`));
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
