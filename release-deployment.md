# Agent pipeline: release & development plan

The goal: take one agent idea through every stage of the agent pipeline and come out with a working, secured, evaluated, deployed agent. This file is the task list for getting there. Check items off as they land; `WORK-TO-BE-DONE.md` keeps the summary line.

**Status:** every stage below comes from the owner's research. Nothing past the stage 1 questions is built yet.

## How the stages connect

Each stage reads the artifact before it and writes its own, using the same envelope as the project pipeline (`lib/store.ts`).

| # | Stage | Reads | Writes | Built today? |
|---|---|---|---|---|
| 1 | Define the Job | `raw-idea` | `product-spec` (with an `agent` block) | Partly. The question rounds are aimed at agents; the spec is still shaped like a product spec |
| 2 | Agent Design | `product-spec` | `agent-design` | No. Placeholder card |
| 3 | Engineering & Development | `product-spec`, `agent-design` | `build-manifest` | Runs the project build flow, not an agent build |
| 4 | Security | `agent-design`, `build-manifest` | `security-report` | No. Placeholder card |
| 5 | Evaluations | `build-manifest`, `security-report` | `qa-report` (eval results + pinned baseline) | Runs the project QA flow |
| 6 | Deployment | `qa-report` | `deploy-manifest` | Runs the project deploy flow |
| 7 | Operations (+ ↻ Iteration) | `deploy-manifest` | `ops-report` | Runs the project ops flow; the Iterate panel is static |

**Build order:** the adapter layer (below) first, then 1 → 2 → 3 → 4. That is enough to produce an agent that runs locally and has been security-checked, and it's the first full end-to-end test. Then 5 → 6 → 7.

## What we're building, and the one rule

**What:** the person describes the job, and the pipeline writes the LangChain code itself. The person sees the whole problem: the job, the design, the risks and the evals. They never have to hand-code the agent framework, so someone non-technical can ship an agent.

**The rule:** LangChain and LangSmith are the **default**, never a hard dependency. Every tool sits behind an interface and a registry, the same pattern as `lib/llm/` and `lib/design/engine.ts`. So we can swap one out, add one, or try two side by side without touching the stages.

### The slots

Each stage asks for a slot, never a specific vendor:

| Slot | Interface (what the stage calls) | Default adapter | Used in |
|---|---|---|---|
| Agent framework | render code from `agent-design`: the loop, tools, structured output, step limit | LangChain `create_agent` | 3 |
| Human approval | pause before an approval-flagged tool call | LangGraph interrupts | 4 |
| Tracing | send traces, read runs back | LangSmith tracing | 3, 7 |
| Auth | authenticate requests, keep users' data separate | LangSmith custom auth | 4, 6 |
| Unit tests | generate and run deterministic tests | pytest | 5 |
| Eval runner | versioned dataset, evaluators, compare to baseline | LangSmith Evaluation | 5, 7 |
| Runtime host | deploy the agent, promote it, roll it back | LangSmith Deployment | 6 |
| Chat UI | a frontend wired to the runtime | Agent Chat UI | 6 |
| Web host | host the UI | Vercel | 6 |
| CI | run the gates on every pull request, approve production | GitHub Actions | 6 |
| Monitoring | alerts, online evals, cost | LangSmith | 7 |

### How the swapping works

- **Neutral artifacts.** `agent-design`, the eval dataset and the reports are written in framework-neutral shapes; tools use plain JSON Schema. An adapter translates them into LangChain, or into whatever replaces it. Nothing upstream changes when an adapter does.
- **Same resolution order as the design engine.** `lib/agent/registry.ts` holds one registry per slot, and `activeAdapter(slot, projectId)` resolves in this order:
  1. the project's own choice (`settings.agentStack[slot]`)
  2. else the default adapter, if it's connected
  3. else a fallback
- **The toolbox is generated from the registries.** A new adapter shows up in the onboarding table with its section and Update pop-up automatically. No hand-edited rows.
- **One code template per adapter**, kept under `templates/agent/<adapter>/`, with an Agent Stack picker on Agent Design.
  - The picker shows LangChain by default, plus any other adapter that's registered.
  - The picker shows each slot's adapter and warns when a choice adds cost or complexity, like `lib/stack.ts` does for projects.
- **Adding a tool** means writing one adapter file (interface, toolbox entry, template) and registering it. No stage code changes.

- [ ] `lib/agent/` with the slot interfaces, the registries and `activeAdapter()`, built **before** stage 2 so every stage is written against it from the start.
- [ ] LangChain-ecosystem adapters for every slot in the table.
- [ ] Generate `TOOLBOX.agent` from the registries, replacing the hand-written rows in `components/Onboarding.tsx`.
- [ ] Agent Stack picker on Agent Design, saved to `settings.agentStack`.


---

## 1. Define the Job

**Research:** Identify the users, one valuable task, the success and failure criteria, the actions the agent is allowed to take, latency and cost budgets, how sensitive the data is, and a human fallback.

**Produces:** the spec, plus an `agent` block that every later stage reads.

- [ ] Add the `agent` block to the spec schema, used only for agent projects:
  - `users`
  - `task`: exactly one
  - `success_criteria[]`
  - `failure_criteria[]`
  - `allowed_actions[]`
  - `forbidden_actions[]`
  - `latency_budget`, e.g. "< 30s per run"
  - `cost_budget`, e.g. "< $0.10 per run"
  - `data_sensitivity`: public, internal, PII or regulated
  - `human_fallback`: who takes over, and when
  - `example_tasks[]`: 3–5 real inputs paired with what the right output looks like. These become the test set in stages 3 and 5.
- [ ] Re-aim `AGENT_PO_FOCUS` (`lib/phases/product-owner.ts`) at exactly those fields, so each round of questions fills the gaps.
- [ ] Show the agent fields on the Define the Job page, in two short sections like the project version: **The job** and **Boundaries & budgets**.

**Done when:** the spec has all of these fields, with at least 3 example tasks.

## 2. Agent Design

**Research:** Select a model. Specify the inputs, outputs, tool contracts, permissions, data sources and conversation state, and decide when a deterministic workflow is enough instead of an agent. Add retrieval only if the task needs outside knowledge. LangChain's model and tool integrations are the reusable building blocks.

**Produces:** an `agent-design` artifact.

- [ ] `lib/phases/agent-design.ts` generates the design from the spec:
  - **Model choice** and why, checked against the latency and cost budgets.
  - **Workflow or agent?** If the steps are fixed, say so and design a deterministic workflow instead. This is an explicit decision, not an assumption.
  - **Input and output schema.** The output schema is what stage 3 uses for structured output.
  - **Tool contracts**, one per tool: name, input schema, output, side effects (read or write), the permission it needs, and whether a human must approve it.
  - **Data sources.**
  - **Retrieval:** yes or no, and why. Default is no.
  - **Conversation state:** none, per conversation, or long-term memory.
- [ ] A page and API route following the per-phase pattern in CLAUDE.md, replacing the placeholder card.
- [ ] Map each tool contract to a LangChain integration where one exists; otherwise mark it as a custom tool to build.

**Done when:** every allowed action from stage 1 maps to a tool contract, and every tool has its permission and approval flag set.

## 3. Engineering & Development

**Research:** Build a single tool-calling loop with a bound on how many steps it can take, structured output, error handling, tracing and a safe fallback, then test it locally on actual tasks. LangChain's `create_agent` provides the configurable loop and structured responses. LangSmith Studio lets you inspect runs and state locally before deploying.

**Produces:** a runnable agent in the project's workspace folder, plus a `build-manifest`.

- [x] **Decided: Python** for the agents we generate (owner, 2026-10-14). LangChain is Python-first, and stage 5 uses pytest. The orchestrator app itself stays TypeScript; it only writes and runs the Python agent code in each project's workspace folder.
- [ ] An agent build template (the LangChain adapter for the framework slot) that Claude Code fills in from `agent-design`:
  - a `create_agent` call with the designed model and tools
  - the output schema as the structured response format
  - a step limit (no unbounded loops)
  - retries and error handling on every tool
  - LangSmith tracing turned on
  - a safe fallback that hands off to the human from stage 1
- [ ] A local test script that runs the stage 1 example tasks through the agent and prints a pass or fail for each.
- [ ] Add LangSmith to the toolbox as a real key: a configure route plus an Update pop-up. It's listed today but not wired.
- [ ] Point Engineering at this template for agent projects, instead of the project stack picker.

**Done when:** the agent runs locally, the example tasks pass, and their runs can be inspected in LangSmith Studio.

## 4. Security

**Research:** Threat-model prompt injection and tool misuse. Authenticate users, keep each user's conversations separate, authorize each tool call against the user's identity, limit privileges and spending, protect secrets, and require approval for consequential writes. Set retention and audit policies. LangSmith custom authentication covers authenticating requests on a deployment, but resource authorization must also be configured to keep users' data separate. LangGraph interrupts pause critical actions for human approval.

**Produces:** a `security-report` with a pass or fail for each item. It gates Evaluations.

- [ ] **Threat model, generated from the design:**
  - every place untrusted text gets in (emails, web pages, files, tool output), each paired with what an injected instruction could make the agent do
  - for each tool, the worst misuse and the control that stops it
- [ ] **Checklist the report scores:**
  - User authentication (LangSmith custom auth).
  - Conversation isolation per user (resource authorization).
  - Every tool call authorized against the user's identity.
  - Least privilege and a spending cap.
  - Secrets kept out of prompts, logs and traces.
  - Human approval on consequential writes (LangGraph interrupts).
  - A retention policy and an audit log.
- [ ] Build the missing controls into the agent template from stage 3: interrupts on approval-flagged tools, and auth and isolation config.
- [ ] Replace the Security placeholder card with the report page.

**Done when:** every checklist item passes, or has a written exception the owner signed off on.

## 5. Evaluations

**Research:** Test the code and how tools fail. Curate expected outcomes, edge cases, multi-turn cases and adversarial inputs. Compare quality, tool choice, safety, latency and cost against a pinned baseline. pytest runs the deterministic unit and integration tests. LangSmith Evaluation runs versioned-dataset evaluations before a release and can also evaluate live traces after it.

**Produces:** `qa-report` holding the eval results, compared against the pinned baseline. It gates Deployment.

- [ ] **pytest suite**, generated with the build:
  - a unit test for each tool contract
  - tests of what happens when a tool fails (timeouts, bad responses, permission denied)
  - an integration test through the whole loop
- [ ] **LangSmith dataset**, versioned and seeded from the stage 1 example tasks, covering:
  - expected outcomes
  - edge cases
  - multi-turn conversations
  - adversarial inputs (stage 4's threat model provides these)
- [ ] **Evaluators** scoring quality, tool choice, safety, latency and cost, with latency and cost checked against the stage 1 budgets.
- [ ] **Pinned baseline:** the first run that passes becomes the baseline. Every later run is compared against it, and any regression fails the gate.
- [ ] Turn the Evaluations stage into an evals page (score per evaluator plus the difference from baseline), in place of the project QA flow for agents.

**Done when:** pytest is green and every evaluator meets or beats the baseline and the budgets.

## 6. Deployment

**Research:** Add a usable streaming UI, real-user authentication and feedback. Deploy the API or runtime and the UI. Run tests and evaluations on every pull request, stage changes, require approval for production, release through a canary, and keep the ability to roll back. LangSmith Deployment hosts the agent runtime and manages the production infrastructure. Agent Chat UI supplies a ready-made chat frontend; its production guide requires a secured proxy or custom authentication, never a LangSmith key exposed to the browser. Vercel hosts the web app. GitHub Actions connects tests, offline evals, preview deployments and promotion, and protected environments can require release approval.

**Produces:** `deploy-manifest` (runtime URL, UI URL, environments, how to roll back).

- [ ] **Runtime:** the agent on LangSmith Deployment, with the stage 4 custom auth turned on.
- [ ] **UI:** Agent Chat UI on Vercel, behind a secured proxy or custom auth (no LangSmith key in the browser), with streaming and a thumbs up/down feedback control wired to LangSmith feedback.
- [ ] **Real-user authentication** (Clerk is the studio default; confirm it fits the custom-auth handler).
- [ ] **GitHub Actions pipeline:**
  - on every pull request: pytest, then the offline evals, then a preview deploy
  - merging to main deploys to staging
  - production sits behind a protected environment that needs approval
  - production is released as a canary first, with a one-step rollback to the previous revision
- [ ] Toolbox: wire Vercel and GitHub keys. A GitHub configure route already exists (`app/api/github/configure`).

**Done when:** a pull request runs the full gate, an approved release reaches production through the canary, and a rollback has been rehearsed once.

## 7. Operations + ↻ Iteration

**Research:** Track failures, user feedback, quality, latency, token cost and tool behavior. Alert on regressions, review incidents, add production failures to the offline dataset, and redeploy only after the gates pass. LangSmith tracing and cost tracking show usage per run and in aggregate. LangSmith alerts flag regressions in errors, latency, cost and feedback, and its online evaluations score a sample of production runs.

**Produces:** `ops-report`. Iteration loops back to Define the Job.

- [ ] **Dashboard** (read from LangSmith): failures, feedback, quality, latency, token cost and tool behavior.
- [ ] **LangSmith alerts** on regressions in errors, latency, cost and feedback.
- [ ] **Online evaluations** on a sample of production runs, using the stage 5 evaluators.
- [ ] **Incident loop:** each production failure gets reviewed and added to the stage 5 dataset. A redeploy goes back through stages 5 and 6 and only ships when the gates pass.
- [ ] Make the Operations **Iterate** panel dynamic from this data, replacing the static `lib/ops-iterate.ts` lists.

**Done when:** alerts fire on a test regression, and a production failure flows into the dataset and through a gated redeploy.

---

## Applies to every stage

- [ ] The **agent toolbox** (`components/Onboarding.tsx` → `TOOLBOX.agent`) stays matched to this plan. Every tool is listed but none is wired: LangChain, LangGraph, pytest and Agent Chat UI need no key; LangSmith, Vercel and GitHub Actions need configure flows.
- [ ] **First end-to-end run:** use the Inbox Triage Agent example, recording where each stage breaks.
- [ ] Run `npx tsc --noEmit` after every change, and check pages on the owner's dev server (localhost:3001). Never start a second dev server.
