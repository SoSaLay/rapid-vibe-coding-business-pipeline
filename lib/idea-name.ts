/**
 * A short name for an idea or agent when the owner doesn't give one — plain text rules, no AI (free, instant).
 * "I want to create an agent that will chase overdue invoices every Friday" → "Chase Overdue Invoices".
 */

/** Lead-ins that say nothing about what it does. Longest first; stripped repeatedly. */
const LEAD_INS = [
  /^(hey|hi|ok|okay|so|basically|um+|uh+)[,\s]+/,
  /^(every|each|once a)\s+\w+\s+/,
  /^(i|we)\s+(would like|want|need|wanna|am trying|are trying|'?d like)\s+(to\s+)?/,
  /^(can you|could you|please|let'?s)\s+/,
  /^(create|build|make|set up|setup|design|develop|have|get)\s+/,
  /^(me\s+)?(an?|the|my|our|some)\s+/,
  /^(ai\s+)?(agent|app|application|tool|bot|assistant|product|platform|website|site|system|automation)s?\s+/,
  /^(that|which|who|to|for|so it|so that it|where it|it)\s+/,
  /^(will|can|would|should|could|automatically|just|basically)\s+/,
  /^(helps?|help)\s+(me|us|people|users)?\s*(to\s+)?/,
];

const STOP = new Set(
  "um uh umm go goes going do does a an the and or but of to for in on at by with from into onto my our your their his her its me us them it this that these those is are be been was were will would can could should just also then so very really every each all any some about as up out over".split(" ")
);

/** Scheduling words make names long ("every Friday at 9"); they're dropped. */
const TIME = new Set("daily weekly monthly hourly morning evening night today tomorrow day week month hour minute monday tuesday wednesday thursday friday saturday sunday".split(" "));

export function nameFromText(text: string, kind: "agent" | "project" = "project"): string {
  let s = text.toLowerCase().replace(/\s+/g, " ").trim();
  // First sentence or clause only.
  s = s.split(/[.!?;\n]| - | — /)[0] ?? s;
  for (let changed = true; changed; ) {
    changed = false;
    for (const re of LEAD_INS) {
      const next = s.replace(re, "");
      if (next !== s) {
        s = next.trim();
        changed = true;
      }
    }
  }
  const words = (s.match(/[a-z0-9][a-z0-9'+&-]*/g) ?? []).filter((w) => !STOP.has(w) && !TIME.has(w) && !/^\d+$/.test(w));
  const picked = words.slice(0, 3);
  if (!picked.length) return kind === "agent" ? "New Agent" : "New Idea";
  return picked.map((w) => (w.length <= 3 && /^(ai|api|crm|seo|pdf|csv|sms|ui|ux)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}
