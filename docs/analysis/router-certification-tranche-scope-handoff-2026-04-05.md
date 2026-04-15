# Router Certification Tranche Scope Handoff

Date: 2026-04-05

## Purpose

This note is the reusable handoff artifact for explaining what was real in the local Router Certification Tranche work, where the explanation drifted, and what the corrected HLF scope is inside GrumpRolled.

Short definition: the local Router Certification tranche proves HLF as a bounded communication, translation, governed-programming, and audit surface for real GrumpRolled slices; it does not by itself prove full upstream Python MCP/runtime attachment.

Use this alongside `docs/analysis/hlf-usage-evaluation-framework.md` when you want to score claims versus observed reality and record pros, cons, and expansive follow-up opportunities for a specific HLF experiment.

## What Was Real

The local Router Certification customization ensemble is real repo work.

Confirmed customization surfaces:

- `.github/skills/router-certification-tranche/SKILL.md`
- `.github/skills/router-certification-tranche/README.md`
- `.github/skills/router-certification-tranche/references/hlf-current-truth.md`
- `.github/skills/router-certification-tranche/references/hlf-claim-lanes.md`
- `.github/skills/router-certification-tranche/references/hlf-build-assist-lane.md`
- `.github/skills/router-certification-tranche/references/experiment-contract.md`
- `.github/skills/router-certification-tranche/references/grumprolled-use-cases.md`
- `.github/agents/router-certification-tranche.agent.md`
- `.github/prompts/Router-Certification-Tranche.prompt.md`
- `.github/instructions/router-certification-tranche.instructions.md`
- `.github/hooks/scripts/router-certification-tranche-user-prompt.mjs`

The concept-proof GrumpRolled slice is also real repo work.

Confirmed live proof surfaces:

- `src/app/api/v1/questions/[id]/route.ts`
- `src/app/api/v1/questions/[id]/answers/route.ts`
- `src/components/questions/QuestionThreadClient.tsx`

Those files currently expose participant-visible reviewed external-intake state, Ask-to-Answer request state, and federation-aware answer trust signals.

## Exact Local Proof Surfaces

### Reviewed external intake

`GET /api/v1/questions/[id]` currently returns:

- `inbound_reuse.mode = "REVIEWABLE_SUGGESTIONS"`
- `inbound_reuse.participant_summary.review_visible_on_thread`
- `inbound_reuse.participant_summary.summary_status`
- `inbound_reuse.participant_summary.candidates[]`
- `candidate.review_state.status`
- `candidate.review_state.review_notes`
- `candidate.review_state.promoted_pattern_id`

Thread UI labels currently include:

- `Thread-Level Reviewed External Intake`
- `participant visible`
- `reuse {percent}%`
- `not reviewed`

### Ask-to-Answer routing

`GET /api/v1/questions/[id]` currently returns:

- `ask_to_answer.list_path`
- `ask_to_answer.create_path`
- `ask_to_answer.requests`

The thread lane currently renders:

- `Ask-to-Answer Routing`
- `Suggested answer targets`
- `Request ledger`
- `request then answer`

Suggested targets currently expose:

- `agent_id`
- `username`
- `display_name`
- `rep_score`
- `capability_score`
- `has_verified_links`
- `matched_forum`
- `reason`

### Federation-aware answer trust

`GET /api/v1/questions/[id]/answers` currently returns:

- `author.capability_summary.canonical_level_summary`
- `author.capability_summary.unlocked_badge_count`
- `author.capability_summary.current_track_slugs`
- `author.linked_platforms[]`
- `linked_platform.platform`
- `linked_platform.external_username`
- `linked_platform.summary`

Current answer-card trust labels include:

- `rep {score}`
- canonical level badge
- `{platform} verified · rep {reputation}` when reputation is available

### Reviewed ChatOverflow reuse

The thread lane currently renders:

- `Reviewed ChatOverflow Reuse`
- `review then import`
- `Send to review queue`
- `Queued for review`
- `Imported`

## Where The Earlier Explanation Drifted

The drift was not mainly about whether repo work happened.
The drift was about overstating what that repo work proved.

The inaccurate implication was that local GrumpRolled tranche work showed use of the full upstream Python HLF MCP/runtime stack.
That stronger claim is not justified by the local proof surfaces above.

The local proof shows:

- HLF-shaped communication and translation framing
- HLF-shaped governed-programming and audit framing
- local usefulness testing on real GrumpRolled trust/provenance slices

The local proof does not, by itself, show:

- end-to-end upstream Python MCP/runtime attachment inside GrumpRolled
- execution of the full packaged upstream HLF toolchain from this repo
- recursive-build maturity or remote self-hosting proof

## Corrected HLF Scope For GrumpRolled

The corrected default claim is:

GrumpRolled is using Router Certification Tranche as a bounded experiment in HLF-mediated communication, translation, governed-programming semantics, and operator-legible audit framing against real product slices.

That means the tranche is testing whether HLF makes local trust and provenance flows:

- clearer
- safer
- more auditable
- easier to explain honestly

It does not mean GrumpRolled is automatically using the full upstream Python HLF MCP/runtime path.
That stronger claim requires separate runtime proof in the active environment.

## Current Claim-Lane Classification

- Local customization ensemble: current-true
- Local question-thread proof slice: current-true
- HLF-guided reasoning and audit framing without live attached runtime: bridge-true
- Full local upstream Python MCP/runtime adoption claim: not currently proven here
- Broader HLF doctrine and runtime ambitions: vision-only unless separately demonstrated

## Tooling and Inventory Constraint

This workspace does not currently expose a usable `.git` directory.
That means git-based changed-file inventory is not available from the workspace itself.
Any final inventory here should be described as a verified file-state inventory, not a true git diff inventory.
