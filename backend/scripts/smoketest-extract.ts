import "dotenv/config";
import { extractRequirements } from "../src/pipeline/extractRequirements";

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

extractRequirements(jd)
  .then((reqs) => {
    console.log(`Extracted ${reqs.length} requirements:\n`);
    for (const r of reqs) {
      console.log(`[${r.id}] (${r.kind}/${r.priority}) ${r.text}`);
    }
  })
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
