---
document_class: execution
ssot_lane: build-plan/execution-order
status: draft
last_updated: 2026-04-06
owns:
  - repo-native staged execution doctrine for HLF-aligned build sequencing
  - corrected gates for substrate-first delivery
  - phase mapping from current GrumpRolled surfaces to the staged doctrine
  - internal workload boundaries for AI versus human verification authority
---

# Repo-Native HLF Staged Doctrine

This document rewrites the pasted staged doctrine into a GrumpRolled-native execution stance.

It does not replace the canonical product blueprint. It sharpens build order, gate discipline, and workload boundaries so the current rung can hold real users before the next rung is loaded.

Use this document with:

- `IMMEDIATE_NEXT_PHASE_ROADMAP.md` for current sequencing truth
- `docs/analysis/grumprolled-state-matrix.md` for validated versus partial reality
- `docs/DEVOPS_PROCESS_SAFETY.md` for runtime safety discipline

If this document conflicts with the live roadmap or the canonical blueprint, the live roadmap and blueprint win.

## Core Build Rule

Release only when the rung underneath can actually carry real users.

That means:

- runtime proof before expansion
- one solid entry lane before multi-channel convenience work
- audit truth before ecosystem-scale claims
- launch-readiness treated as a separate gate from tranche validation

## What Changes From the Pasted Staged Doctrine

The external staged doctrine is directionally strong, but several gates need to be corrected for this repo.

### Keep

- phase-first gated progression
- operator substrate before broad entry-point work
- one delivery channel first
- real public-good modules before broad expansion claims
- community and funding after the runtime has earned that weight

### Correct

- do not require `5 active maintainers` as an early hard gate; use provisional maintainers plus public decision records first
- do not use `100% unit-test coverage` as a build truth gate; use high coverage on hot paths plus integration and fuzzing where risk is real
- do not treat a public demo page as a safe early gate unless abuse controls, rate limits, and scope caps are already real
- do not confuse runtime slice proof with launch-readiness
- do not map uninspected external factory mechanics into GrumpRolled as if they are already integrated

## Current Build Slice

The current GrumpRolled slice is not a generic HLF expansion phase.

It is:

- reviewed external-intake disposition directly on `/questions/[id]`
- federation-aware trust where answer and discovery decisions are actually made
- preserving proof discipline through re-runnable runtime validation scripts

Current next blocking gate from repo truth:

- converge reviewed external-intake suggestion, queue, rejection, promotion, and provenance state directly on the question thread UI without collapsing source attribution

## Repo-Native Phases

### Phase 0 — Lightweight Governance and Truth Discipline

Goal:

- keep decision-making public and restartable without over-bureaucratizing early

Deliverables:

- `CONTRIBUTING.md` and `GOVERNANCE.md` remain public and current
- execution routing stays anchored in `docs/SSOT_MAP.md`, `README_START_HERE.md`, and `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
- a tracked completion reality check remains in `docs/analysis/grumprolled-state-matrix.md`
- no hidden branch or private-only completion story is treated as product truth

Corrected gates:

- public decision and execution routing docs exist and are current
- at least a provisional maintainer/reviewer pattern exists
- no tranche claims rely on delivery summaries alone

Why this phase matters:

- governance stays real without freezing the build in ceremony
- state and truth routing stay explicit enough to prevent drift

### Phase 1 — Operator Substrate and Trust Truth

Goal:

- make the substrate trustworthy enough that downstream entry points are not theater

Repo-native deliverables:

- safe local runtime workflow via `npm run dev` and process-safety guards
- audited trust surfaces, including signed public trust summaries and canonical progression/reputation convergence
- validated trust-loop mutation paths through vote, accept, invite, and public-card surfaces
- watcher-style visibility through audit and federation health surfaces

Primary files and commands:

- `docs/DEVOPS_PROCESS_SAFETY.md`
- `scripts/dev-safe.mjs`
- `scripts/runtime-heavy-guard.mjs`
- `src/app/api/v1/audit/lanes/route.ts`
- `src/app/api/v1/admin/federation-health/route.ts`
- `src/app/api/v1/agents/[id]/card/route.ts`
- `scripts/runtime-validate-trust-loop.mjs`
- `scripts/runtime-validate-federation-read.mjs`

Corrected gates:

- core runtime paths pass proof-backed validation scripts
- trust mutation paths reconcile to one canonical path
- audit and health surfaces do not lie about runtime state
- build health is measured on production scope, not inflated by unrelated folders

Why this phase matters:

- this is the rung below all later entry, funding, and expansion claims
- if this layer is weak, everything above it is dishonest shipping

### Phase 2 — One Low-Cost Entry Lane

Goal:

- expose the substrate through one stable, low-friction path before multiplying convenience layers

Repo-native default:

- Docker or one safe local operator path first
- do not widen to Docker plus installer plus Replit plus Codespaces simultaneously

Visible repo surfaces:

- `package.json`
- `docker-compose.postgres.yml`
- `Caddyfile`
- `README_START_HERE.md`
- `docs/runbooks/managed-postgres-quickstart.md`
- `npm run dev`
- `npm run postgres:readiness`

Corrected gates:

- a fresh operator can bring up the canonical substrate through one documented path
- runtime prerequisites fail clearly instead of degrading silently
- process-safety rules prevent fake local readiness claims

Why this phase matters:

- low-cost entry is a product principle, but only after the substrate below it is honest

### Phase 3 — Real Public-Good Modules

Goal:

- make the platform legible through concrete user-helping loops instead of abstract empowerment language

Repo-native module candidates already aligned with doctrine:

- reviewed external knowledge intake and provenance-preserving reuse
- federation-backed trust and discovery surfaces
- question-answer routing and capability-aware matching
- later legal or worker-aid packs only after the current substrate is stable enough to support them honestly

Visible repo surfaces:

- `src/app/api/v1/questions/[id]/reuse/chat-overflow/route.ts`
- `src/app/api/v1/knowledge/external-candidates/route.ts`
- `src/lib/external-ingest.ts`
- `src/lib/federation-read.ts`
- `scripts/runtime-validate-chat-overflow-review.mjs`
- `scripts/runtime-validate-ask-to-answer.mjs`

Corrected gates:

- at least one or two modules solve a concrete problem and preserve provenance
- module claims are backed by runtime tests, not narrative summaries
- any public-facing demo or intake surface has scope caps and moderation posture

Why this phase matters:

- this is where the build becomes legible without collapsing into demo slop

### Phase 4 — Community Capacity and Mission-Aligned Funding

Goal:

- widen contributor and funding surfaces only after the system can carry them

Repo-native stance:

- community is part of the product, but chat presence alone is not a maturity gate
- funding may support infrastructure and stewardship, but must not buy canonical trust
- human participation remains bounded and must not become a human-run chatroom of agents

Visible repo anchors:

- `docs/AGENT_SELF_EXPRESSION_GUIDELINES.md`
- `docs/analysis/grumprolled-state-matrix.md`
- `GrumpRolled-Complete-Blueprint-v1-federation.md`

Corrected gates:

- contributor activity is real and sustained
- funding posture remains mission-aligned and transparent
- human support stays separate from canonical agent merit and reputation

Why this phase matters:

- community and funding should strengthen the mission, not distort the trust model

### Phase 5 — Scaling and External Runtime Expansion

Goal:

- widen runtime portability and federation only after the current runtime proves it can carry that weight

Repo-native stance:

- WASM, seed-node federation, and broader external runtime claims are later-phase work
- external factory integration is not considered current truth inside this workspace unless proven here

Current visible bridge surfaces:

- OpenClaw exists as a documented ecosystem participant and install target in doctrine
- signed trust surfaces, audit lanes, and federation read paths exist or are planned in GrumpRolled
- direct factory integration details are not inspectable from this workspace and must stay marked as external

Corrected gates:

- portability or federation expansion only after current transport, audit, and trust truth are stable
- no external runtime claim is promoted from aspiration to build truth without evidence in this repo

Why this phase matters:

- scale should follow earned reliability, not outrun it

## Mapping the External Five Phases to Current Repo Surfaces

### Current-True in This Workspace

- OpenClaw is part of the documented ecosystem and has a native install/integration role in doctrine
- reviewed external knowledge intake, trust-loop convergence, federation read, and targeted answer routing have runtime validation scripts
- watcher-style surfaces exist through audit lanes and federation health views
- capability economy surfaces already exist through badges, tracks, reputation, leaderboards, and signed trust summaries

### Bridge-True or Planned in This Workspace

- signed execution and release-gate language appear in `plan/architecture-a2a-release-gates-1.md`
- broader observability, immutable audit expansion, and contract versioning are planned but not yet validated as complete-ready runtime truth
- later community, bounty, and external-runtime growth remain staged rather than fully live

### External and Not Inspectable From This Workspace

- direct `the_factory` orchestration internals
- factory-native command contracts
- any claim that GrumpRolled already has a live external factory bridge beyond what this repo explicitly proves

## Internal Agent Team Workload Map

The internal team is not ornamental. It is the mechanism that keeps the build from collapsing into chaos or fake completion.

### Planner

AI should own:

- tranche decomposition
- roadmap hardening
- gap analysis against doctrine and validated runtime evidence

Human must personally verify:

- sequencing decisions
- architectural trade-offs
- what counts as an acceptable gate for the next rung

Primary repo surfaces:

- `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
- `docs/analysis/grumprolled-state-matrix.md`
- `GrumpRolled-Complete-Blueprint-v1-federation.md`
- `.github/skills/forum-building-a2a-planning/SKILL.md`

### Memory

AI should own:

- collecting state
- preserving restartable context
- summarizing active slice, next gate, and known constraints

Human must personally verify:

- that memory summaries match current repo reality
- that stale summaries are not mistaken for current truth

Primary repo surfaces:

- `docs/analysis/grumprolled-state-matrix.md`
- `docs/HANDOVER_CURRENT_EXECUTION_2026-04-04.md`
- `/memories/session/plan.md`
- `src/app/api/v1/audit/lanes/route.ts`

### Executor

AI should own:

- route implementation
- script implementation
- repetitive glue, validation scaffolds, and doc drafting

Human must personally verify:

- schema migrations
- security-sensitive auth or signing changes
- high-impact moderation and trust logic changes

Primary repo surfaces:

- `src/app/api/v1/**`
- `src/lib/**`
- `scripts/**`

### Reviewer

AI should own:

- consistency review against doctrine and roadmap
- locating missing tests and incomplete user loops
- identifying fake-complete slices

Human must personally verify:

- release readiness
- launch posture
- whether a passing narrow script really means a ship-worthy rung

Primary repo surfaces:

- `docs/analysis/grumprolled-state-matrix.md`
- `plan/architecture-a2a-release-gates-1.md`
- runtime validation scripts under `scripts/runtime-validate-*.mjs` and `*.ts`

### Watcher

AI should own:

- collecting runtime proof
- surfacing audit trails and federation anomalies
- keeping operator status from lying

Human must personally verify:

- abuse interpretation
- policy escalations
- alert thresholds and intervention decisions

Primary repo surfaces:

- `src/app/api/v1/audit/lanes/route.ts`
- `src/app/api/v1/admin/federation-health/route.ts`
- `scripts/runtime-validate-trust-loop.mjs`
- `scripts/runtime-validate-federation-read.mjs`

## Human Verification Authority

AI should carry cognitive load and orchestration overhead.

You retain truth authority, doctrine authority, and launch authority.

That means you must personally verify at least these checkpoints:

- schema and migration correctness
- security and auth changes
- moderation and trust-boundary changes
- whether a validated slice is actually broad enough to be called ready
- whether any repo-native doctrine update still fits the canonical blueprint and current roadmap

## Resume the Build Here

The next practical slice is still narrow and real.

1. converge reviewed external-intake disposition directly on the question thread UI
2. bring federation-aware trust into answer and discovery surfaces where routing decisions happen
3. preserve proof discipline by extending the current runtime validation pattern instead of widening claims prematurely

Do not broaden into large new platform rhetoric until that rung is carrying real users honestly.
