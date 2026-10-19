/**
 * One-line "how to get this key" for the keys a built agent needs. Matched on the
 * env var name; unknown keys fall back to a generic hint using the key's label.
 */
const HELP: { match: RegExp; how: string }[] = [
  { match: /_(DATABASE|DB|PAGE|CHANNEL|SHEET|PROJECT|WORKSPACE)?_?ID$/, how: "Copy the ID from the service, usually from the page's URL or its settings." },
  { match: /ANTHROPIC/, how: "console.anthropic.com → API Keys → Create key." },
  { match: /OPENAI/, how: "platform.openai.com → API keys → Create new secret key." },
  { match: /GOOGLE_API|GEMINI/, how: "aistudio.google.com → Get API key." },
  { match: /MISTRAL/, how: "console.mistral.ai → API Keys." },
  { match: /GROQ/, how: "console.groq.com → API Keys." },
  { match: /XAI/, how: "console.x.ai → API Keys." },
  { match: /DEEPSEEK/, how: "platform.deepseek.com → API keys." },
  { match: /FIREWORKS/, how: "fireworks.ai → Account → API Keys." },
  { match: /TOGETHER/, how: "api.together.ai → Settings → API Keys." },
  { match: /TWITTER|(^|_)X_/, how: "developer.x.com → your project's app → Keys and tokens." },
  { match: /SLACK/, how: "api.slack.com/apps → your app → OAuth & Permissions → Bot User OAuth Token." },
  { match: /NOTION/, how: "notion.so/my-integrations → New integration → copy the secret, then share pages with it." },
  { match: /GITHUB/, how: "github.com → Settings → Developer settings → Fine-grained tokens." },
  { match: /GMAIL|GOOGLE/, how: "console.cloud.google.com → APIs & Services → Credentials (enable the API first)." },
  { match: /SHOPIFY/, how: "Shopify admin → Settings → Apps → Develop apps → API credentials." },
  { match: /STRIPE/, how: "dashboard.stripe.com → Developers → API keys (use a restricted key)." },
  { match: /AIRTABLE/, how: "airtable.com/create/tokens → Create token." },
  { match: /HUBSPOT/, how: "HubSpot → Settings → Integrations → Private Apps → Create." },
  { match: /LINEAR/, how: "linear.app → Settings → API → Personal API keys." },
  { match: /DISCORD/, how: "discord.com/developers → your app → Bot → Reset Token." },
  { match: /TWILIO/, how: "console.twilio.com → Account Info (SID and Auth Token)." },
  { match: /SENDGRID/, how: "app.sendgrid.com → Settings → API Keys." },
  { match: /RESEND/, how: "resend.com → API Keys." },
  { match: /DB_URL|DATABASE|POSTGRES/, how: "Your database dashboard (e.g. Supabase or Neon) → Connect → copy the connection string." },
  { match: /SERP|TAVILY|EXA|BRAVE/, how: "Sign in to the search provider's dashboard → API keys." },
];

export function keyHelp(env: string, label: string): string {
  const hit = HELP.find((h) => h.match.test(env.toUpperCase()));
  return hit?.how ?? `Sign in to ${label.replace(/\s*(api\s*)?(key|token|secret)s?$/i, "") || "the service"} → developer or API settings → create a key.`;
}
