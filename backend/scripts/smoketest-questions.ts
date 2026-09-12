import "dotenv/config";
import { extractRequirements } from "../src/pipeline/extractRequirements";
import { generateQuestions } from "../src/pipeline/generateQuestions";

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
  const requirements = await extractRequirements(jd);
  console.log(`Extracted ${requirements.length} requirements.\n`);

  const questions = await generateQuestions({
    requirements,
    roleTitle: "Senior Backend Engineer",
    seniority: "Senior",
    companyBrief: {
      summary: "A fintech company building payment infrastructure.",
      what_they_do: "Processes transactions for merchants at scale.",
    },
  });

  console.log(`Generated ${questions.length} questions:\n`);
  for (const q of questions) {
    console.log(`[${q.id}] (${q.category}, difficulty ${q.difficulty}) -> tests [${q.requirement_ids.join(", ") || "none"}]`);
    console.log(`  Q: ${q.prompt}`);
    console.log(`  A: ${q.answer_outline}\n`);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
