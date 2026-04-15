# GrumpRolled Current Execution Handover

Date: 2026-04-04

Purpose: compress the current working context into one restartable artifact so execution can continue without relying on a long chat transcript.

## Back Context

- This conversation has grown large enough that it is now a practical context and performance bottleneck.
- The repo workspace is not currently exposed as a git repository through the tool surface, so handoff must rely on direct file references and validated command history rather than git diff summaries.
- The current active implementation slice has moved past private progression surfacing into trust-loop hardening, the public trust surface, seeded-threshold track proof, reviewed inbound external reuse, and broader federation read proof: canonical progression projection, canonical reputation reconciliation, public capability summaries, signed-card convergence, username-addressed public agent profiles, reviewable ChatOverflow intake, and private/public federated summaries now all have live runtime evidence.
- Recent side work also landed on governance and moderation reporting: owner rationale capture, safety review counters, selectable moderation windows, CSV export, and governance filtering.
- The repo now has a canonical tracked completion scorecard in `docs/analysis/grumprolled-state-matrix.md` and that file should be treated as the place to update `MVP %`, `Launch %`, and `Blueprint %` as tranches ship.
- Error-handling expectation is now explicit: unresolved errors must be treated as real repo state even when they predate the current change. Separate pre-existing issues from newly introduced ones, but do not minimize either.

## Refresh Deep Dive of SSOT

### Lane 1: Doctrine / Target-State Truth

Primary authority:

- `GrumpRolled-Complete-Blueprint-v1-federation.md`

What it owns:

- product identity
- platform scope
- federation posture
- governance model
- moderation philosophy
- long-range architecture direction

Use doctrine to answer: what GrumpRolled is supposed to become.

### Lane 2: Notes / Guides / Routing

Primary authority:

- `docs/SSOT_MAP.md`
- `docs/AGENT_DOCS_INDEX.md`

Use guides to answer: where to read next, how to interpret docs, and where runtime notes fit.

### Lane 3: Build Plan / Execution-Order Truth

Primary authority:

- `IMMEDIATE_NEXT_PHASE_ROADMAP.md`

Use execution docs to answer: what should be built next right now.

Critical rule:

- Do not let delivery summaries or older MVP plans overrule the current execution roadmap.

## Following Reading Order

Use this order after a context reset:

1. `docs/SSOT_MAP.md`
2. `README_START_HERE.md`
3. `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
4. `docs/analysis/grumprolled-state-matrix.md`
5. `GrumpRolled-Complete-Blueprint-v1-federation.md` only for doctrine questions or architecture truth

If resuming the current slice specifically, then read these next:

1. `src/lib/gamification-progress.ts`
2. `src/lib/progression-sync.ts`
3. `src/lib/auth.ts`
4. `src/lib/capability-signals.ts`
5. `src/app/api/v1/agents/me/route.ts`
6. `src/app/api/v1/agents/search/route.ts`
7. `src/app/api/v1/agents/[id]/card/route.ts`
8. `src/lib/public-agent-profile.ts`
9. `src/app/api/v1/agents/by-username/[username]/route.ts`
10. `src/app/agents/[username]/page.tsx`
11. `src/components/questions/QuestionCard.tsx`
12. `src/app/questions/discovery/page.tsx`
13. `scripts/runtime-validate-trust-loop.mjs`
14. `scripts/runtime-validate-track-progression.ts`
15. `src/app/api/v1/questions/[id]/reuse/chat-overflow/route.ts`
16. `src/app/api/v1/questions/reuse/chat-overflow/route.ts`
17. `src/app/api/v1/knowledge/external-candidates/route.ts`
18. `src/lib/external-ingest.ts`
19. `src/lib/federation-read.ts`
20. `scripts/runtime-validate-chat-overflow-review.mjs`
21. `scripts/runtime-validate-federation-read.mjs`

## Current Scorecard Snapshot

- MVP: `60%`
- Launch: `40%`
- Blueprint: `33%`

Source of truth for future updates:

- `docs/analysis/grumprolled-state-matrix.md`

## Current Active Slice

Slice name: trust-loop hardening and runtime validation for capability economy surfaces.

Objective:

- keep progression, reputation, and public trust surfaces on one canonical path
- prove that private progression, public capability summaries, and signed cards converge after live mutations
- prove seeded track advancement against real thresholds without lowering seeds or faking tiers

What existed before this slice:

- seeded badges and upgrade tracks
- `GET /api/v1/gamification/progress`
- standalone `/badges` and `/tracks` catalogue pages
- leaderboards and rep surfacing in multiple forum/question surfaces

What was missing before this slice:

- no real private agent profile loop showing progression
- `/api/v1/agents/me` did not expose progression
- progression existed, but was not part of the normal signed-in experience

## Implemented In This Slice

### Shared progression helper

File:

- `src/lib/gamification-progress.ts`

What it does:

- centralizes badge and track progression computation for an agent
- returns rep score, authored patterns, validations, unlocked badges, and per-track current/next gate state

### Persisted projection and canonical read path

Files:

- `src/lib/progression-sync.ts`
- `src/app/api/v1/gamification/progress/route.ts`
- `src/app/api/v1/onboarding/map/route.ts`
- `src/app/api/v1/agents/onboarding-map/route.ts`

What changed:

- computed progression is now projected into `AgentBadge` and `AgentUpgrade`
- onboarding and private progression reads now consume the same canonical evaluator instead of stale persisted badge reads alone

### Canonical reputation reconciliation

File:

- `src/lib/auth.ts`

What changed:

- rep calculation now includes question votes and durable `KnowledgeContribution.repEarned` rewards
- shared `reconcileAgentReputation()` updates stored rep and then syncs progression
- removes the previous drift where question votes and invite rewards could diverge from recomputed rep

### Mutation-path convergence

Files:

- `src/app/api/v1/questions/[id]/vote/route.ts`
- `src/app/api/v1/answers/[id]/vote/route.ts`
- `src/app/api/v1/questions/[id]/answers/[answerId]/vote/route.ts`
- `src/app/api/v1/questions/[id]/accept/route.ts`
- `src/app/api/v1/grumps/[id]/vote/route.ts`
- `src/app/api/v1/invites/redeem/route.ts`

What changed:

- stale vote and invite routes now go through canonical reputation reconciliation
- question voting now affects stored rep and emits vote notifications
- invite rewards are no longer fragile direct increments that can be erased by later recomputes

### Public capability summaries

Files:

- `src/lib/capability-signals.ts`
- `src/app/api/v1/agents/search/route.ts`
- `src/app/api/v1/agents/[id]/card/route.ts`
- `src/app/questions/discovery/page.tsx`

What changed:

- public search results now include persisted capability summaries
- signed agent cards now include canonical capability summary plus unlocked badges/current tracks
- question discovery top-agent cards now surface capability summary instead of raw rep only

### First public agent profile surface

Files:

- `src/lib/public-agent-profile.ts`
- `src/app/api/v1/agents/by-username/[username]/route.ts`
- `src/app/agents/[username]/page.tsx`

What changed:

- added a username-addressed public agent profile API
- added a first true public trust page that keeps `/me` private and session-oriented
- public discovery now links into that route instead of leaving trust signals fragmented across search and signed cards

### Public author byline linking

Files:

- `src/app/grumps/[id]/page.tsx`
- `src/components/questions/QuestionCard.tsx`
- `src/app/questions/page.tsx`
- `src/app/patterns/page.tsx`
- `src/app/forums/[slug]/page.tsx`
- `src/app/forums/page.tsx`
- `src/app/leaderboards/reputation/page.tsx`
- `src/app/leaderboards/forums/[slug]/page.tsx`

What changed:

- high-value public author surfaces now use `/agents/[username]` as the default trust target
- bylines no longer strand trust in raw text when a public profile exists

### Seeded-threshold track progression proof

File:

- `scripts/runtime-validate-track-progression.ts`

What changed:

- adds a re-runnable progression proof that seeds real pattern, validation, and contribution counts against current upgrade-track thresholds
- proves mid-tier advancement across multiple track families without changing seeds

### Reviewed inbound ChatOverflow reuse

Files:

- `src/app/api/v1/questions/[id]/reuse/chat-overflow/route.ts`
- `src/app/api/v1/questions/reuse/chat-overflow/route.ts`
- `src/app/api/v1/questions/[id]/route.ts`
- `src/app/api/v1/knowledge/external-candidates/route.ts`
- `src/lib/external-ingest.ts`

What changed:

- question-bound reuse suggestions now expose existing review state for already-seen external candidates
- local questions can now queue reviewed ChatOverflow candidates directly into the external-candidate lane
- queued candidates carry question-local review context and promotion continues through the existing explicit review gate

### Broader federation read proof

Files:

- `src/lib/federation-read.ts`
- `src/app/api/v1/federation/links/route.ts`
- `src/app/api/v1/federation/links/[platform]/profile/route.ts`
- `src/app/api/v1/agents/me/route.ts`
- `src/app/api/v1/agents/search/route.ts`
- `src/app/api/v1/agents/[id]/card/route.ts`
- `src/lib/public-agent-profile.ts`
- `scripts/runtime-validate-federation-read.mjs`

What changed:

- the runtime proof now covers both `CHATOVERFLOW` and `MOLTBOOK` summaries across private and public trust surfaces
- signed cards, public profile API, agent search, and private `/agents/me` are now all exercised by one federated read validator

### Enriched current-agent API

File:

- `src/app/api/v1/agents/me/route.ts`

What changed:

- now includes `progression` in the response
- progression is computed via the shared helper rather than duplicated route logic

### Real signed-in agent profile page

File:

- `src/app/me/page.tsx`

What changed:

- new authenticated profile surface for agent sessions
- shows identity summary, joined forums, linked identity, contribution stats, track progress, and earned badges
- includes navigation to track and badge catalogues plus reputation leaderboard

### Session shortcut into the new surface

File:

- `src/components/navigation/session-status-chip.tsx`

What changed:

- agent session shortcut now routes into `/me`
- this turns progression into part of the normal session flow instead of a hidden API-only feature

### Validation coverage

File:

- `tests/unit/gamification-progress.test.ts`

What changed:

- verifies unlocked badges and current/next track computation for a representative agent state

## Validation State

Focused command history confirms:

- `npm test -- tests/unit/gamification-progress.test.ts tests/unit/progression-sync.test.ts tests/unit/auth-reputation.test.ts tests/unit/capability-signals.test.ts`
- exit code: `0`
- focused ESLint on the recent trust-loop files returned `ESLINT_OK`
- `npm run runtime:trust-loop`
- runtime result on Apr 4, 2026 after public profile expansion: `39 passed, 0 failed`
- `npm run runtime:track-progress`
- runtime result on Apr 4, 2026: `19 passed, 0 failed`
- `npm run runtime:reuse-review`
- runtime result on Apr 4, 2026: `18 passed, 0 failed`
- `npm run runtime:federation-read`
- runtime result on Apr 4, 2026: `27 passed, 0 failed`

Runtime proof now covers:

- question vote -> rep update
- top-level answer vote -> rep update
- accepted answer -> rep/progression update
- invite issuance + redemption -> durable reward reconciliation
- DID register -> DID verify -> signed card issue -> signed card verification
- `/api/v1/agents/me` progression badge counts matching `/api/v1/agents/search` capability summary
- signed card capability summary matching private progression state
- `/api/v1/agents/by-username/[username]` capability summary matching the same private progression state
- `/agents/[username]` rendering successfully as the first public trust surface
- seeded progression proof unlocking `coding-journeyman`, `reasoning-specialist`, and `execution-master` via canonical rep reconciliation and persisted `AgentUpgrade` rows
- question-bound ChatOverflow reuse now queues and rehydrates reviewed external candidates through the external-intake lane
- federated summaries now have one runtime proof path across verified links, per-platform refresh, `/agents/me`, `/agents/search`, public profiles, and signed cards

## Known Repo State To Carry Forward

These are not to be ignored.

### Progression slice state

- current focused lint for the progression files is green
- no newly surfaced diagnostics were reported in the files listed above at the last focused check

### Existing unresolved repo/documentation state

- `README_START_HERE.md` has existing markdown-lint issues unrelated to the progression slice
- those issues remain real unresolved repo state and should be treated as backlog debt unless explicitly fixed

### Structural tooling state

- tool surface reports that the workspace is not exposed as a git repository
- do not rely on git-based handoff during restart unless repo tooling state changes

## Exact Files To Reopen First

- `docs/SSOT_MAP.md`
- `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
- `docs/analysis/grumprolled-state-matrix.md`
- `src/lib/gamification-progress.ts`
- `src/lib/progression-sync.ts`
- `src/lib/auth.ts`
- `src/lib/capability-signals.ts`
- `src/app/api/v1/agents/me/route.ts`
- `src/app/api/v1/agents/search/route.ts`
- `src/app/api/v1/agents/[id]/card/route.ts`
- `src/lib/public-agent-profile.ts`
- `src/app/api/v1/agents/by-username/[username]/route.ts`
- `src/app/agents/[username]/page.tsx`
- `src/components/questions/QuestionCard.tsx`
- `src/app/questions/page.tsx`
- `src/app/patterns/page.tsx`
- `src/app/forums/[slug]/page.tsx`
- `src/app/forums/page.tsx`
- `src/app/leaderboards/reputation/page.tsx`
- `src/app/leaderboards/forums/[slug]/page.tsx`
- `src/app/leaderboards/invites/page.tsx`
- `src/components/admin/AdminPanel.tsx`
- `src/app/me/page.tsx`
- `scripts/runtime-validate-trust-loop.mjs`
- `scripts/runtime-validate-track-progression.ts`
- `scripts/runtime-validate-chat-overflow-review.mjs`
- `scripts/runtime-validate-federation-read.mjs`
- `tests/unit/gamification-progress.test.ts`
- `tests/unit/progression-sync.test.ts`
- `tests/unit/auth-reputation.test.ts`
- `tests/unit/capability-signals.test.ts`

## Next Practical Execution Steps

1. Surface the reviewed external-intake queue more directly in the UI so the new review/import loop is not API-only.
2. Expand the new public profile route into any remaining low-value byline surfaces only where it improves trust navigation and does not clutter owner/operator views.
3. After that, continue the adjacent federation/knowledge lane:
   - extend runtime-proven provenance beyond the current platform set
   - harden outbound/write-side federation and reviewed publication paths

## Execution Restart Message

Use this exact restart prompt after context reset:

Refresh deep dive of SSOT first.

Read in order:

1. `docs/SSOT_MAP.md`
2. `README_START_HERE.md`
3. `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
4. `docs/analysis/grumprolled-state-matrix.md`

Then resume the last real slice: capability economy completion via the new visible progression loop.

Open and inspect:

1. `src/lib/gamification-progress.ts`
2. `src/app/api/v1/agents/me/route.ts`
3. `src/app/me/page.tsx`
4. `src/components/navigation/session-status-chip.tsx`
5. `tests/unit/gamification-progress.test.ts`

Assume this repo rule: unresolved errors are real state even if they predate the current change. Distinguish them from newly introduced issues, but do not minimize either.

Primary next action: move from API-proven reviewed external intake into visible operator/user surfaces, while continuing the next federation and publication tranche from the now-broader runtime-proof base.
