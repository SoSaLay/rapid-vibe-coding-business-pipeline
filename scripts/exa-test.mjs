/**
 * Exa query test harness.
 *
 * Lets us tune how we turn an idea into forum/Reddit search queries before we
 * wire Exa into the Idea Validation phase. Run:
 *
 *   EXA_API_KEY=... node scripts/exa-test.mjs
 *
 * Optionally pass an idea: node scripts/exa-test.mjs "your idea here"
 */

const API_KEY = process.env.EXA_API_KEY;
if (!API_KEY) {
  console.error("Set EXA_API_KEY first:  EXA_API_KEY=... node scripts/exa-test.mjs");
  process.exit(1);
}

const idea = process.argv[2] || "An app that auto-generates invoices for freelancers from their calendar events.";

// Candidate query styles — we compare which surfaces the best real chatter.
const queries = [
  "freelancers frustrated tracking billable hours from their calendar",
  "how do freelancers invoice clients and track time",
  "manual invoicing is too time consuming for freelancers",
  "best freelance time tracking and invoicing tool complaints",
];

// Forum domains to focus on; comment out includeDomains for "forums in general".
const FORUM_DOMAINS = ["reddit.com", "news.ycombinator.com", "quora.com", "stackexchange.com", "indiehackers.com"];

// Recency: only the last ~18 months of discussion.
const startPublishedDate = new Date(Date.now() - 18 * 30 * 24 * 3600 * 1000).toISOString();

async function search(query, { redditOnly }) {
  const body = {
    query,
    type: "auto",
    numResults: 5,
    startPublishedDate,
    includeDomains: redditOnly ? ["reddit.com"] : FORUM_DOMAINS,
    contents: {
      highlights: true,
      summary: { query: `What problem, frustration, or opinion is expressed here about: ${idea}` },
    },
  };
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`  ! ${res.status} ${await res.text()}`);
    return null;
  }
  return res.json();
}

console.log(`\nIDEA: ${idea}\n${"=".repeat(70)}`);

for (const q of queries) {
  console.log(`\n🔎 QUERY: "${q}"`);
  const data = await search(q, { redditOnly: false });
  if (!data) continue;
  console.log(`   cost: $${data.costDollars?.total ?? "?"} · ${data.results.length} results`);
  for (const r of data.results) {
    console.log(`\n   • ${r.title}`);
    console.log(`     ${r.url}`);
    console.log(`     published: ${r.publishedDate || "?"}`);
    if (r.summary) console.log(`     summary: ${r.summary.trim().slice(0, 240)}`);
    if (r.highlights?.[0]) console.log(`     “${r.highlights[0].trim().slice(0, 200)}”`);
  }
}
console.log("\nDone.\n");
