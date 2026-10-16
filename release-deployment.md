# Agent pipeline: release & development plan

The goal: take one agent idea through every stage of the agent pipeline and come out with a working, secured, evaluated, deployed agent. This file is the task list for getting there. Check items off as they land; `WORK-TO-BE-DONE.md` keeps the summary line.

**Status (2026-10-15):** all 7 stages are built. Stages 1–5 are verified live end to end. Stages 6–7 are verified locally: Docker image, local Postgres, the server, approvals, the kill switch, redaction, live checks, ops and alerts. The actual AgentCore and Railway pushes still need the owner's AWS or Railway keys.

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

## Decisions (owner, 2026-10-14)

- **Agent Design is where every choice is made.** The user picks and approves the model, tools, data sources, memory and approval points there. Nothing new is decided after that.
- **Engineering only executes the approved design, automatically.** No new choices. Its job is to write the codebase into the project's folder and walk the user through what was built.
- **Engineering's end artifact is the codebase.** Show it as "this is your agent's code: the logic and configuration doing the work." A plain-language summary of each part comes first. The user can open the files but doesn't need to.
- **No LangSmith Deployment.** At $39/month (Plus plan) it costs too much for hosting. The runtime host slot is open; pick a cheaper option before stage 6. LangSmith's free tier (1 seat, 5k traces/month) still covers tracing and Studio during the build.
- **Tool credentials** (the agent's own logins, e.g. Gmail): a new `credentials` slot.
  - v1: paste keys or connect through a login screen in the app, stored under `data/` like other keys, and copied into the host's secrets on deploy.
  - Later: a managed broker (Composio or Arcade) so each end user connects their own accounts.

**Build order:** the adapter layer (below) first, then 1 → 2 → 3 → 4. That is enough to produce an agent that runs locally and has been security-checked, and it's the first full end-to-end test. Then 5 → 6 → 7.

## What we're building, and the one rule

**What:** the person describes the job, and the pipeline writes the LangChain code itself. The person sees the whole problem: the job, the design, the risks and the evals. They never have to hand-code the agent framework, so someone non-technical can ship an agent.

**The rule:** LangChain and LangSmith are the **default**, never a hard dependency. Every tool sits behind an interface and a registry, the same pattern as `lib/llm/` and `lib/design/engine.ts`. So we can swap one out, add one, or try two side by side without touching the stages.

### The slots

Each stage asks for a slot, never a specific vendor:

| Slot | Interface (what the stage calls) | Default adapter | Used in |
|---|---|---|---|
| Tool credentials | store the agent's own tool logins, inject them at run and deploy time | In-app paste or connect (`data/`); Composio or Arcade later | 2, 3, 6 |
| Agent framework | render code from `agent-design`: the loop, tools, structured output, step limit | LangChain `create_agent` | 3 |
| Human approval | pause before an approval-flagged tool call | LangGraph interrupts | 4 |
| Tracing | send traces, read runs back | **Langfuse** (free tier / self-host); LangSmith alternative | 3, 5, 7 |
| Auth | authenticate requests, keep users' data separate | **Supabase Auth** (follows the state DB); Neon Auth; Clerk when charging users | 4, 6 |
| Unit tests | generate and run deterministic tests | pytest | 5 |
| Eval runner | versioned dataset, evaluators, compare to baseline | **Built-in local runner** (the gate never depends on a vendor) | 5, 7 |
| Runtime host | deploy the agent, promote it, roll it back | **Amazon Bedrock AgentCore**; Railway alternative (one Docker image for both) | 6 |
| State database | conversations, memory, pending approvals | **Supabase Postgres**; Neon alternative | 6 |
| Chat UI | a frontend wired to the runtime | Agent Chat UI (needs a LangGraph-compatible server, so it must match the runtime host) | 6 |
| Web host | host the UI | Vercel | 6 |
| CI | run the gates on every pull request, approve production | GitHub Actions | 6 |
| Monitoring | alerts, online evals, cost | Langfuse + pipeline-side alerts | 7 |

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

- [x] `lib/agent/` with the slot interfaces, the registries and `activeAdapter()`, built **before** stage 2 so every stage is written against it from the start.
- [x] LangChain-ecosystem adapters registered for every slot. Active: framework (LangChain), credentials (in-app), approval (LangGraph interrupts), tracing (LangSmith), unit tests (pytest via uv). The rest are listed as planned.
- [ ] Generate `TOOLBOX.agent` from the registries, replacing the hand-written rows in `components/Onboarding.tsx`.
- [ ] Agent Stack picker on Agent Design, saved to `settings.agentStack`.


---

## 1. Define the Job

**Research:** Identify the users, one valuable task, the success and failure criteria, the actions the agent is allowed to take, latency and cost budgets, how sensitive the data is, and a human fallback.

**Produces:** the spec, plus an `agent` block that every later stage reads.

- [x] Add the `agent` block to the spec schema, used only for agent projects:
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
- [x] Re-aim `AGENT_PO_FOCUS` (`lib/phases/product-owner.ts`) at exactly those fields, so each round of questions fills the gaps.
- [x] Show the agent fields on the Define the Job page, in two short sections like the project version: **The job** and **Boundaries & budgets**.

- [x] Steer ideas that aren't agent-shaped (a one-off question, a single transformation with no tools) toward the nearest agent version through the questions and answer options. Never warn or block; if the owner keeps their framing, continue normally.

**Done when:** the spec has all of these fields, with at least 3 example tasks.

## 2. Agent Design

**Research:** Select a model. Specify the inputs, outputs, tool contracts, permissions, data sources and conversation state, and decide when a deterministic workflow is enough instead of an agent. Add retrieval only if the task needs outside knowledge. LangChain's model and tool integrations are the reusable building blocks.

**Produces:** an `agent-design` artifact, **approved by the user**. Every choice is shown as an editable recommendation (model, tools, data, memory, approval points), and the user approves it before Engineering runs.

- [x] `lib/phases/agent-design.ts` generates the design from the spec:
  - **Model choice** and why, checked against the latency and cost budgets.
  - **Workflow or agent?** If the steps are fixed, say so and design a deterministic workflow instead. This is an explicit decision, not an assumption.
  - **Input and output schema.** The output schema is what stage 3 uses for structured output.
  - **Tool contracts**, one per tool: name, input schema, output, side effects (read or write), the permission it needs, and whether a human must approve it.
  - **Data sources.**
  - **Retrieval:** yes or no, and why. Default is no.
  - **Conversation state:** none, per conversation, or long-term memory.
- [x] A page and API route following the per-phase pattern in CLAUDE.md, replacing the placeholder card.
- [x] Map each tool contract to a LangChain integration where one exists; otherwise mark it as a custom tool to build.
- [x] Every choice is editable, and an **Approve design** step locks it. Engineering reads only the approved version.
- [x] Each tool lists the credential it needs, and the user connects it here (credentials slot).

**Done when:** every allowed action from stage 1 maps to a tool contract, and every tool has its permission and approval flag set.

## 3. Engineering & Development

**Research:** Build a single tool-calling loop with a bound on how many steps it can take, structured output, error handling, tracing and a safe fallback, then test it locally on actual tasks. LangChain's `create_agent` provides the configurable loop and structured responses. LangSmith Studio lets you inspect runs and state locally before deploying.

**Produces:** a runnable agent in the project's workspace folder, plus a `build-manifest`.

**How it works:** fully automatic. The approved design goes in, and the codebase is written with no new decisions. The page walks the user through the build as it happens and ends on a **Your codebase** view: a plain-language summary of each part (logic, tools, config, tests), with the files one click away for anyone who wants to look.

- [x] **Decided: Python** for the agents we generate (owner, 2026-10-14). LangChain is Python-first, and stage 5 uses pytest. The orchestrator app itself stays TypeScript; it only writes and runs the Python agent code in each project's workspace folder.
- [x] An agent build template (the LangChain adapter for the framework slot) that Claude Code fills in from `agent-design`:
  - a `create_agent` call with the designed model and tools
  - the output schema as the structured response format
  - a step limit (no unbounded loops)
  - retries and error handling on every tool
  - LangSmith tracing turned on
  - a safe fallback that hands off to the human from stage 1
- [x] A local test script that runs the stage 1 example tasks through the agent and prints a pass or fail for each.
- [ ] Add LangSmith to the toolbox as a real key: a configure route plus an Update pop-up. It's listed today but not wired.
- [x] Point Engineering at this template for agent projects, instead of the project stack picker.
- [x] Code generation runs automatically from the approved `agent-design`, and the orchestrator sets up the Python environment and runs the local tests itself.
- [x] **Your codebase** view: a file tree plus a plain-language summary of what each part does.

**How it's built:** the template writes everything safety-related (step limit, retries, approvals via `HumanInTheLoopMiddleware`, dry run for writes, fallback hand-off, tracing). The model writes only the system prompt, the tool bodies, and per-example test fixtures, so example tests run without real inbox or API access. If the install check fails, the build regenerates once automatically using the error. Env vars the generated code reads are added to the Credentials list.

**Done when:** the agent runs locally, the example tasks pass, and their runs can be inspected in LangSmith Studio.

## 4. Security

**Research:** Threat-model prompt injection and tool misuse. Authenticate users, keep each user's conversations separate, authorize each tool call against the user's identity, limit privileges and spending, protect secrets, and require approval for consequential writes. Set retention and audit policies. LangSmith custom authentication covers authenticating requests on a deployment, but resource authorization must also be configured to keep users' data separate. LangGraph interrupts pause critical actions for human approval.

**Produces:** a `security-report` with a pass or fail for each item. It gates Evaluations.

- [x] **Threat model, generated from the design:**
  - every place untrusted text gets in (emails, web pages, files, tool output), each paired with what an injected instruction could make the agent do
  - for each tool, the worst misuse and the control that stops it
- [x] **Checklist the report scores:**
  - User authentication (LangSmith custom auth).
  - Conversation isolation per user (resource authorization).
  - Every tool call authorized against the user's identity.
  - Least privilege and a spending cap.
  - Secrets kept out of prompts, logs and traces.
  - Human approval on consequential writes (LangGraph interrupts).
  - A retention policy and an audit log.
- [x] Interrupts on approval-flagged tools are in the template.
- [ ] Auth and per-user isolation config. These checks show "At deployment" until a runtime host is picked.
- [ ] A retention-policy setting (today the PII check needs an owner sign-off).
- [x] Replace the Security placeholder card with the report page.

**Done when:** every checklist item passes, or has a written exception the owner signed off on.

## 5. Evaluations ✅

**Research (owner):** Capture end-to-end traces, build a versioned set of real task cases with explicit pass/fail criteria, and block releases on task-completion, tool-use and safety regressions. Measure both the outcome and the process: task completion, grounding, tool choice, arguments, sequence, policy adherence, and abstaining when evidence is missing. Test in layers (unit tests with mocks, then end-to-end and multi-turn cases), with a near-perfect regression suite plus a harder capability suite. Cover routine, ambiguous, tool-error, timeout, edge and adversarial cases. Repeat each case several times, and tell first-try success apart from consistency. Set thresholds against your own baseline.

**Decided:** the evaluation engine is **built in and local**. The dataset is versioned in the agent's repo, scoring runs on this machine, and the gate plus baseline are stored with the project, so a release decision never depends on a vendor. **Langfuse** is the default viewer for traces (free cloud tier or free self-host); LangSmith is the alternative.

- [x] **Layers:** `pytest tests/test_tools.py` (deterministic, no model), then `evals/run_evals.py`: every case × N tries (dry run, test data for the tools), run in parallel.
- [x] **Dataset** (`evals/dataset.json`, committed to git, versioned): the stage 1 example tasks form the regression suite. Model-written edge, ambiguous, tool-error, timeout, multi-turn and adversarial cases form the capability suite; the attacks come from the stage 4 threat model. Production failures are carried into every new version.
- [x] **Scoring per run:** checks in code first (must-call and must-not-call tools, abstaining when it should), then a model judge (task completed, grounded, number of unsupported claims, policy followed, abstained).
- [x] **Metrics:** success overall, by suite and by kind of case. Right first try vs right every try. Grounded rate. Right-tools rate. Unsafe calls. Injection success rate. Tool-error runs. p50/p95 latency. Tokens, cost per run and cost per successful task.
- [x] **Gate:**
  - unit tests pass
  - 0 injections succeed
  - 0 unsafe tool calls in attack and routine cases
  - regression suite at least 90% and no more than 5 points below baseline
  - capability suite no more than 10 points below baseline
  - p95 latency and cost per run within the stage 1 budgets

  The first passing run becomes the pinned baseline; "Make this the new baseline" re-pins it. A failing gate needs a written override, which is kept in the `qa-report`.
- [x] Every run is traced to Langfuse when it's connected, tagged with the dataset version and case id.
- [ ] Integration tests against the real tool APIs. These need real credentials and should be a live smoke run, opt-in.

**Verified (Inbox Triage):** 15 cases × 2 tries in about 90s, about $0.03 per run. Regression 90%, attacks 0% successful, harder cases 70%, p95 10.6s.

## 6. Deployment

**Research (owner):**
- **CI/CD and releases:** version the code, model, prompts, tools and config. Automate quality, regression and security tests before deploying. Require approval for production. Release through a canary and keep rollback.
- **Runtime:** isolated, scalable environments. Authentication, tenant isolation, rate limits. Persisted state for long-running workflows and recovery. Limits on retries, tool calls, runtime and cost.
- **Security:** least privilege, secured secrets, every tool call authorized, sandboxed code execution, restricted network access, human approval for consequential actions.
- **Tools named:**
  - GitHub Actions, Argo Rollouts
  - Kubernetes, LangGraph checkpointers, Temporal, KEDA
  - Vault, OPA, E2B, Bedrock Guardrails
  - managed hosting: LangSmith Deployment, Amazon Bedrock AgentCore, Microsoft Foundry Agent Service, Google Agent Engine
- **Priority:** automated testing, secure runtime controls, CI/CD and rollback come first.

**Recommended fit for a solo, low-cost studio** (to confirm):
- **Runtime host slot:** Amazon Bedrock AgentCore Runtime as the default. It's pay-per-use, matches the studio's AWS default, and gives per-session isolation and identity. A self-hosted container (FastAPI + a LangGraph Postgres checkpointer on Supabase or Neon) is the second adapter. Kubernetes, Argo, KEDA and Temporal are overkill at this scale; revisit when traffic needs them.
- **CI slot:** GitHub Actions. On each PR: unit tests, then evals, then a preview deploy. Merging to main deploys to staging. Production sits behind a protected environment that needs approval.
- **Canary and rollback:** deploy each release as a new runtime version and run the evals against it live. Then repoint the production endpoint, keeping the previous version so rollback is one step. Check whether the chosen host can split traffic for a true canary.
- **Runtime limits** (template): step limit (done), retry caps (done), a tool-call cap per run, a cost cap per run, and a rate limit per user.
- **Secrets:** the host's secret store (AWS Secrets Manager with AgentCore). Vault only if self-hosting at scale.
- **Decided (owner, 2026-10-14): agent host is AgentCore by default, Railway as the alternative.** Both deploy one Docker image that the pipeline generates. Railway builds it from GitHub; AgentCore builds it in AWS. Users don't need Docker installed; Docker Desktop is optional, for local testing.
- **Decided: agent state lives in Postgres, Supabase by default, Neon as the alternative.** It holds conversations, memory and actions waiting for approval.
- **Decided: login rule (built).** Define the Job records `people_use_it` and `charges_users`; Agent Design recommends the login from them, and the user can change it. Nobody uses it directly → machine key, no login. People use it, free → the state database's own login (Supabase Auth, or Neon Auth). Sold to users → Clerk (login and payments in one account). Each user's conversations are keyed by their user id and isolated with row-level security, and each tool checks the user's role before it runs. Agents that run on their own (no human user) use a machine-to-machine key instead.
- **Chat page (only if people talk to the agent):** a small generated page with the chosen login, calling the agent host. Agent Chat UI only if the host speaks the LangGraph API.
- [ ] **Monthly cost estimate in Agent Design:** model tokens × expected runs + host + database + tracing + paid tools, with assumptions shown. It updates live with the choices and switches to measured cost after Evaluations.

- [x] Runtime host picked: AgentCore (default), Railway (alternative). The choice lives in Agent Design → Hosting & monthly cost; changing it never requires a rebuild.
- [x] **Monthly cost estimate** in Agent Design: model (measured cost per run after Evaluations), host, database, Langfuse, login and the chat page. It updates live.
- [x] **Package step** writes into the agent repo:
  - `server.py` (GET /ping, POST /invocations, POST /feedback) and `agentcore_app.py` (the same handler for AgentCore)
  - `deploy/auth.py`: machine key, or a Supabase / Neon / Clerk login token verified against the provider's JWKS; user roles feed the tool permission checks
  - `deploy/state.py`: Postgres checkpointer, kill switch, run log, plus a CLI
  - `deploy/redact.py`: strips emails, phones, cards and keys from the run log and from Langfuse traces
  - `deploy/client.py`, `deploy/ops.py`, `deploy/agentcore_ops.py`
  - `Dockerfile`, `RUNBOOK.md`, and the `agent-ci` and `agent-ops` GitHub workflows
- [x] **Runtime limits:** step limit, read retries, a tool-call cap per run (`AGENT_MAX_TOOL_CALLS`), a per-user rate limit, per-tool roles (`TOOL_ROLES`), and a kill switch for the whole agent or a single tool (stored in the database, takes effect within about 10s).
- [x] **Isolation:** conversations are stored under `<user id>:<conversation id>`; approvals pause and resume across requests.
- [x] **Releases:** release → staging (AgentCore: a new version on DEFAULT; Railway: the staging environment). The live check runs the eval dataset against the deployed version in its eval mode (dry run + test data). The owner approves → production (AgentCore: the "production" endpoint is pinned to that version; Railway: that commit is shipped). Rollback is one click. Every approval is recorded.
- [x] **`deploy-manifest`** on the first production release, including the Security checks that were deferred to deployment, now marked as configured.
- [x] Toolbox: AWS (AgentCore) and Railway keys.
- [ ] Live verification on AgentCore and Railway (needs the owner's keys). The flags of the AgentCore toolkit (`configure` / `deploy`) are the most likely thing to need adjusting.
- [ ] The generated chat page (only for agents people talk to) on Vercel.
- [ ] Push the agent repo to GitHub automatically, and set its secrets and protected environment.

**Done when:** a pull request runs the full gate, an approved release reaches production through the canary, and a rollback has been rehearsed once.

## 7. Operations + ↻ Iteration

**Research (owner):**
- **Monitoring:** trace the full workflow. Monitor success, errors, latency, tokens and cost. Redact sensitive data from logs and traces. Alert on quality regressions, abnormal actions and service failures.
- **Reliability:** limits on concurrency, retries, tokens and spend. Scale workers with load. Recover from interrupted workflows and failed tool calls. Tune model choice, context size and latency.
- **Incident response:** kill switches for models and tools, rollback runbooks, a named owner and on-call, and a record of incidents, approvals and corrective actions.
- **Continuous improvement:** turn failures, user corrections and new attack patterns into regression tests. Re-evaluate after any change to the model, prompt, tools or policy. Track quality, safety, reliability, latency and cost over time.
- **Tools named:**
  - OpenTelemetry, Langfuse, Arize Phoenix, Datadog
  - Temporal, KEDA
  - Grafana IRM, NIST AI RMF, OWASP AI Agent Security Cheat Sheet
- **Priority:** tracing, production alerts, incident response and continuous evaluation come before scaling usage.

**Recommended fit:**
- **Langfuse** for production traces and cost (already the tracing default).
- **Redaction:** a Langfuse mask function in the template that strips emails, keys and PII before anything leaves the machine.
- **Alerts:** the pipeline polls Langfuse on a schedule and alerts by email (Resend, already connected) or push. No Datadog or Grafana needed yet.
- **Online evals:** run the stage 5 judge on a sample of production traces.
- **Incidents:** reviewed in the Operations page. One click adds a failure to the dataset (the `production` category, already supported) and starts a gated redeploy through stages 5 and 6.
- **Kill switch:** a per-agent "disabled" flag plus a per-tool off list, read by `safety.py` at run time.

- [x] **Ops dashboard** from the agent's own run log (vendor-neutral), over 24h / 7 days / 30 days:
  - runs, how many finished without a hand-off, how many the scorer judged as task done, policy problems
  - p50/p95 latency, cost and cost per run
  - thumbs up/down, hand-offs, tool errors, runs waiting for approval
  - per-tool calls and errors

  Langfuse is for drilling into a single trace.
- [x] Redaction in the run log and in Langfuse traces (mask).
- [x] **Alerts:** success rate, judged task completion, p95, cost per run, policy problems, thumbs-down. Thresholds are set per agent. Email goes through Resend. "Check now" runs it from the app; the `agent-ops` workflow runs it hourly from GitHub.
- [x] **Online evaluations:** the scorer reviews a sample of production runs (completion, grounding, policy); daily via GitHub, or on demand.
- [x] **Kill switch** for the agent and for each tool, plus the runbook in the repo.
- [x] **Incident log** (owner, on-call, severity, approvals, corrective action). **Failed run → "Add to test cases"** creates a new production case in the regression suite and bumps the dataset version; the redeploy then goes through stages 5 and 6.
- [x] The **Iterate** panel for agents is built from live signals: open incidents, unconverted failures, failing tools, thumbs-down, unscored runs, latency.
- [x] `ops-report` artifact on "Record ops review".

**Done when:** alerts fire on a test regression, and a production failure flows into the dataset and through a gated redeploy.

---

## Models, skills, knowledge and light changes (2026-10-15)

- [x] **Custom model** in Agent Design: any `provider:model` LangChain supports (Anthropic, OpenAI or any OpenAI-compatible endpoint, Gemini, Mistral, Groq, xAI, DeepSeek, Fireworks, Together, Ollama). Optional prices feed the cost numbers.
- [x] **Coding model** (toolbox, optional): the model that writes code in Engineering (agent tool bodies, app task graphs). Unset means the AI engine is used.
- [x] **Pydantic** listed in the toolbox (structured output + tool-input validation, built into every agent).
- [x] **Skills** (procedural memory): `skills/<name>/SKILL.md`. The agent sees only each skill's name and description and opens the full playbook with `load_skill` (progressive disclosure). In Agent Design you can use the recommended skills, have one written from a short description, or import one from a GitHub link. Imports are text only, never scripts, and need a security review plus owner sign-off.
- [x] **Knowledge**, one choice: none, built into skills, or document search (RAG). RAG is optional and needs an OpenAI key for embeddings; the index is bundled with the agent (`knowledge/index.json`, small document sets). Not yet tested live (no OpenAI key here).
- [x] **Light vs full changes** (the gate's two paths):
  - Light: skills, knowledge, model, memory, approvals and limits. Apply re-renders from the stored code with no rewrite (about 1s), then Evaluations, then Release.
  - Full: new or changed tools go through Build.
- [x] **Agent console** (Operations): what's live (model, skills, knowledge, tools, release, last eval), the next step for any pending change, and quick links to change it.
- [x] **Memory, set in Agent Design**, with three rows recommended from the job:
  - **This conversation:** LangGraph checkpoints.
  - **User profile:** a `remember` tool, limited to the categories you allow, and redacted.
  - **Past conversations:** the last N exchanges within D days.

  Long-term memory lives in the agent's Postgres (`agent_memory`), but only inside the deployed server. Local runs and evals use in-process memory, so tests never touch real users' data, and a memory failure never breaks a run. Evaluations add memory cases that run as separate conversations: it should remember X, and must not remember Y. Searching memory by meaning (pgvector) is a later option; it would need an embeddings key.
- [x] **Limits & stopping (advanced, pre-filled)** in Agent Design:
  - Per tool: max calls per run, retries and timeout. Reads get 5 calls and 2 retries; writes get 2 calls and no retry.
  - Repeat detection is always on: the same call with the same inputs is stopped after 2 tries.
  - "When it stops" rules come from Define the Job's success and failure criteria, plus the step limit, and are added to the agent's instructions.
  - Evaluations add a "knows when to stop" case.

  All of these are light changes.
- [ ] Diagnosis: a link from each failed run or eval row to its Langfuse trace, plus a per-step timing breakdown.
- [ ] Business scorecard (success criteria vs actual) and the chat page with feedback.

## Applies to every stage

- [ ] The **agent toolbox** (`components/Onboarding.tsx` → `TOOLBOX.agent`) stays matched to this plan. Every tool is listed but none is wired: LangChain, LangGraph, pytest and Agent Chat UI need no key; LangSmith, Vercel and GitHub Actions need configure flows.
- [ ] **First end-to-end run:** use the Inbox Triage Agent example, recording where each stage breaks.
- [ ] Run `npx tsc --noEmit` after every change, and check pages on the owner's dev server (localhost:3001). Never start a second dev server.
