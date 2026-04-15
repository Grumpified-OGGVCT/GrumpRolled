# Handover: Next Thread Continuation

Date: 2026-04-01
Scope: full transition to a new discussion thread with the same objectives and no intentional loss of context

## 1. Current Program Of Work

Primary active objective:

- continue building GrumpRolled per repo-aligned plans, with planning-first workflow discipline and bounded automation

Current implementation lane that was active when this handover was requested:

- expand the free-model and multi-provider router around the providers the user actually has
- preserve additive progress instead of rewriting the router opportunistically
- support clean failover when one provider/account/model hard-fails

## 2. Important Correction To Carry Forward

There was a context-tracking failure in this thread.

What went wrong:

- the work temporarily drifted from "expand the actual provider inventory the user has" into a narrower one-off correction around Mistral
- the change also briefly included guessed credential-alias names inferred from the user's credential inventory, which was not the intended additive approach

What is now the explicit corrective rule:

- do not treat one provider mention as the new center of gravity
- do not infer or invent env alias names from the credential inventory unless the user explicitly wants those aliases created
- preserve the current router structure and extend it additively
- the target is a broader provider inventory and clean failover, not one-off provider patches

## 3. Current Router State

Current file:

- `src/lib/llm-provider-router.ts`

What is already in place:

- provider catalog and route selection logic
- provider health state
- model discovery and dynamic model classification
- multi-account provider pools
- per-account health, cooldown, auth-failure, and quota tracking
- account-aware health checks and model discovery
- additive Mistral AI provider support
- `executeWithProviderFailover` helper exists in the router

What is not fully complete yet:

- live public answer generation still primarily runs through `src/lib/ollama-cloud.ts`
- the router is not yet the sole production execution layer for public answers
- the router/provider inventory is still incomplete relative to the user's actual credential inventory
- provider inclusion should move to a normalized inventory/adapters approach rather than continuing one-off additions

## 4. Current Router Rules To Preserve

- if a provider/account/model hard-fails, fail cleanly to the next compatible candidate
- keep secrets out of repo files and out of chat
- sensitive secret handling stays only between the user and the primary agent
- do not use free-tier routing or broader delegation for passwords, API keys, or similar secrets

## 5. Mistral Status

Mistral AI is now explicitly present in the router as a first-class provider.

This was the additive correction requested after Mistral was identified as a missing provider.

Important caveat:

- Mistral should not be treated as the new exclusive focus
- the broader next step is reconciling all actual providers the user has, not just Mistral

## 6. Credentials And Vault Handling

Important user rule:

- secret-bearing work is primary-agent-only and should not be routed through free-tier or broader delegation paths

Important implementation rule:

- the credentials inventory should be inspected locally without echoing secrets
- provider inventory should be normalized from the real credential source
- provider env/config support should be derived carefully from actual usable shapes, not public-doc assumptions alone

Pending work:

- reconcile the user's actual credential inventory against supported provider adapters
- populate or align the credential vault/config path properly
- avoid guessing alias env names unless explicitly asked to create them

## 7. Planning And Workflow Doctrine

Global workflow preference now established:

- prefer planning-first workflows for exploration, architecture, and plan hardening
- use execution/agent mode mainly when actually editing files, running tools, or using capabilities planning cannot access
- Ask mode is useful, but Plan should be used much more strategically than it has been

Transparency rule:

- be explicit about whether repo-created skills/agents are being actively used versus merely existing

## 8. Browser Research Rule

The user explicitly called out that free BrowserOS-style research should be used before paid/heavier research when adequate.

Important status:

- BrowserOS CLI guidance was loaded
- BrowserOS CLI installation/configuration was requested
- this is still pending and should be completed or explicitly re-checked in the next thread

Requested config noted by user:

- MCP endpoint: `http://127.0.0.1:9002/mcp`
- requested add syntax: `--transport http browseros http://127.0.0.1:9002/mcp --scope user`

## 9. Process Artifacts Created In This Thread

Created or updated artifacts:

- `.github/skills/forum-building-a2a-planning/SKILL.md`
- `.github/agents/pre-execution-hardening.agent.md`
- `plan/templates/pre-execution-review-template.md`
- `plan/architecture-bounty-automation-lane-1.md`
- `plan/architecture-bounded-agent-set-1.md`
- user-scope universal forum/A2A planning skill under `.agents/skills/forum-building-a2a-planning/`

Purpose of these artifacts:

- planning-first hardening
- forum/A2A doctrine enforcement
- bounded automation with explicit approval boundaries
- reusable pre-execution review structure
- future bounded sub-agent architecture

## 10. Bounded Future Agent Set Already Defined

From `plan/architecture-bounded-agent-set-1.md`:

- Presence Operator
- Bounty Intake and Scorer
- Pattern Extractor
- Approval-Packet Builder
- Portability Canary Validator
- Router/Runtime Health and Failover Monitor

Hard rule:

- the system does legwork
- humans approve and apply

## 11. Bounty Automation Doctrine Already Defined

From `plan/architecture-bounty-automation-lane-1.md`:

- automate intake, normalization, scoring, extraction, ranking, and approval-packet generation
- do not let the system autonomously finalize winners, issue credentials, publish recognitions, or modify production-facing surfaces without human approval

## 12. Moltbook Presence Plan Status

Plan exists:

- `plan/architecture-moltbook-presence-sub-agent-1.md`

Status:

- architecturally strong baseline
- additional hardening findings were identified around secrets handling, approval authority, browser fallback limits, verification challenge handling, audit depth, and abuse budgets

That plan still needs an upgraded execution-ready pass using the pre-execution hardening flow.

## 13. Session Memory Note

The current `/memories/session/plan.md` is still dominated by the earlier Postgres-first completion track.

That plan remains important, but it does not fully reflect the later work in this thread around:

- router/provider expansion
- bounded automation doctrine
- bounty automation
- future bounded agent set
- planning-first workflow preferences

In the next thread, do not assume the session plan alone is the whole current state.

## 14. Pending User-Level Copilot Workflow Customization

Discussed and requested, but not fully completed in this thread:

- global user-level instruction for planning-first mode discipline in VS Code Copilot Chat
- three user-level custom agents such as Plan First, Ask Research, and Execute Only

The next thread should either create these cleanly or explicitly restate status before claiming they exist.

## 15. Exact Next-Step Queue

Recommended next sequence:

1. Reconcile the actual provider/credential inventory safely and build a normalized supported-provider list.
2. Extend the router additively for the real provider inventory the user has, not one provider at a time.
3. Keep unsupported or non-chat providers cataloged but inactive until adapters exist.
4. Wire the router failover helper into the live execution path so public answer generation can fail cleanly to the next candidate.
5. Harden the Moltbook presence plan using the pre-execution hardening agent/template.
6. Complete BrowserOS CLI installation/configuration and prefer BrowserOS-first research where adequate.
7. Add the requested global Copilot workflow customization files if still desired in the next thread.

## 16. Carry-Forward Message For The Next Thread

Use this as the starter message in the next thread if needed:

"Continue from the April 1 GrumpRolled handover. Preserve planning-first workflow discipline and bounded automation. Current active implementation lane is additive expansion of the multi-provider/free-model router around my real provider inventory, with clean failover when one provider/account/model hard-fails. Do not infer env alias names from the credential inventory. Mistral has already been added explicitly, but the real next step is reconciling all actual providers I have and extending the router additively, not recentering the system around one provider. Also continue from the created artifacts: forum-building-a2a-planning skill, pre-execution hardening agent, pre-execution review template, bounty automation plan, bounded future agent set, and Moltbook presence plan. System does the legwork; humans approve and apply. Pending items include BrowserOS CLI setup and user-level Copilot planning-first customization files."
