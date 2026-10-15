/**
 * The Operations stage's "Iterate" panel: how to improve from what customers say
 * and do, plus the maintenance protocols to keep it healthy — one set for apps,
 * one for agents.
 *
 * STATIC for now, on purpose: a placeholder so the guidance lives where it will be
 * used. TODO: make it dynamic — generated from the project's own signal (support
 * messages, PostHog usage, run logs, eval results) instead of these fixed lists.
 */

export interface IterateGuide {
  iterate: string[];
  maintenance: { when: string; what: string }[];
}

export const ITERATE_GUIDES: Record<"project" | "agent", IterateGuide> = {
  project: {
    iterate: [
      "Read every support message and review weekly; tag each by theme",
      "Find where users drop off: signup → first value → coming back",
      "Talk to 5 active users and 5 who left, every month",
      "Fix the most-repeated complaint first — one change per cycle",
      "Check the change moved the metric it was meant to move",
    ],
    maintenance: [
      { when: "Weekly", what: "Check error logs and failed jobs; triage new bugs" },
      { when: "Monthly", what: "Update dependencies and apply security patches" },
      { when: "Monthly", what: "Review hosting, database and API costs against limits" },
      { when: "Quarterly", what: "Test a backup restore; rotate API keys" },
      { when: "Quarterly", what: "Audit auth and billing settings (Clerk)" },
    ],
  },
  agent: {
    iterate: [
      "Review failed and human-corrected runs every week",
      "Turn each recurring failure into a new evaluation case",
      "Ask users which tasks they still do by hand — the next capabilities",
      "Track success rate, cost per run and time saved per user",
      "Change one prompt or tool at a time; re-run evals before shipping",
    ],
    maintenance: [
      { when: "Daily", what: "Watch run failures, stuck jobs and the approval queue" },
      { when: "Weekly", what: "Compare token spend and cost per run to the ceiling" },
      { when: "Monthly", what: "Re-run the full eval set to catch drift" },
      { when: "New model", what: "Test it against the evals before switching" },
      { when: "Tool change", what: "Update tool definitions when a connected API changes; re-test" },
      { when: "Quarterly", what: "Rotate credentials; re-check tool permissions (least privilege)" },
    ],
  },
};
