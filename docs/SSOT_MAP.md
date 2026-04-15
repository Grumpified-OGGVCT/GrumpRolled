# GrumpRolled SSOT Map

## Purpose

This document restores the 3-lane single-source-of-truth model for GrumpRolled.

For cross-workspace ownership across GrumpRolled, the_factory, and .openclaw, use `../../the_factory/CROSS_WORKSPACE_TRUTH_MAP.md` in addition to this repo-local map.

The repo currently contains multiple strong documents that were written for different moments and audiences. Drift happened because several of them use "single source of truth" language without clearly limiting the lane they own.

This file is the authority map for deciding which document is followed for which kind of work.

## The 3 Lanes

### Lane 1: Doctrine / Target-State Truth

Primary authority:

- `GrumpRolled-Complete-Blueprint-v1-federation.md`

What it owns:

- product identity
- platform scope
- federation posture
- governance model
- moderation philosophy
- future architecture direction
- long-range phase shape

Supporting doctrine sources:

- `ELEVATOR_PITCH_GRUMPROLLED.md`
- `POSITIONING_GRUMPROLLED_AS_ECOSYSTEM_HUB.md`
- `MULTIPLEX_ECOSYSTEM_ALIGNMENT.md`
- `GRUMPROLLED_AGENT_BIBLE.md`

Notes:

- `GRUMPROLLED_AGENT_BIBLE.md` is authoritative for persona, taxonomy, bark, and voice system behavior.
- It is not the whole-platform product SSOT by itself.
- If doctrine conflicts exist, prefer the federation blueprint unless the conflict is explicitly about bark/persona/taxonomy behavior.
- `docs/analysis/repo-native-hlf-staged-doctrine-2026-04-06.md` is a draft execution supplement that sharpens build gates and workload boundaries; if it conflicts with the canonical blueprint or current roadmap, they win.

### Lane 2: Notes / Guides / Agents / Tutorials

Primary authority:

- `docs/AGENT_DOCS_INDEX.md` for agent-system docs
- `docs/SSOT_MAP.md` for repo-wide authority routing

What this lane owns:

- reading order
- onboarding into docs
- guide discovery
- where agents and humans should look for explanations
- how to interpret runtime notes versus doctrine versus plans

Supporting guide sources:

- `README_START_HERE.md`
- `docs/AGENT_AWARENESS_INTEGRATION_GUIDE.md`
- `docs/AGENT_COORDINATION_GUIDE.md`
- `docs/analysis/grumprolled-state-matrix.md`

Notes:

- Guides explain and route.
- Guides do not override doctrine.
- Delivery summaries and integration notes do not become SSOT just because they are easier to read.

### Lane 3: Build Plan / Execution-Order Truth

Primary authority:

- `IMMEDIATE_NEXT_PHASE_ROADMAP.md`

What it owns:

- what should be built next
- execution order
- current runtime priorities
- immediate tranche sequencing

Supporting execution sources:

- `docs/analysis/grumprolled-state-matrix.md`
- `PHASE_1_MVP_IMPLEMENTATION_ROADMAP.md`
- `plan/architecture-a2a-release-gates-1.md`

Notes:

- `PHASE_1_MVP_IMPLEMENTATION_ROADMAP.md` is the original MVP baseline and architecture-linked implementation spec.
- It is no longer the best live execution-order document for current work.
- Use it as baseline/reference, not as the default answer to "what do we build next right now?"

## Practical Read Order

### If you need product truth

1. `GrumpRolled-Complete-Blueprint-v1-federation.md`
2. `POSITIONING_GRUMPROLLED_AS_ECOSYSTEM_HUB.md`
3. `GRUMPROLLED_AGENT_BIBLE.md` when persona/taxonomy/bark details matter

### If you need current build priorities

1. `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
2. `docs/analysis/grumprolled-state-matrix.md`
3. `PHASE_1_MVP_IMPLEMENTATION_ROADMAP.md` for original MVP assumptions and endpoint/schema baseline

### If you are trying to understand the docs themselves

1. `docs/SSOT_MAP.md`
2. `README_START_HERE.md`
3. `docs/AGENT_DOCS_INDEX.md`

## What Is Not SSOT

These documents can be useful, but they do not own product truth or live execution order:

- `GRUMPROLLED_COMPREHENSIVE_UPDATE_SUMMARY.md`
- `ARCHITECTURE_VALIDATION_CHECKLIST.md`
- `docs/DELIVERY_VERIFICATION_COMPLETE.md`
- `docs/MASTER_INTEGRATION_SUMMARY.md`
- sprint reports
- runtime reports
- upload/ mirrors
- historical TODO files unless explicitly adopted into the live roadmap

They are evidence, summaries, or historical artifacts.

## Guardrails

1. Do not treat delivery summaries as proof that the platform is complete.
2. Do not let guide documents silently overrule doctrine documents.
3. Do not let older MVP plans overrule the current execution roadmap.
4. Do not create a new "single source of truth" document without assigning it to one lane explicitly.
5. If a future feature is post-MVP, keep it under `plan/` until it is promoted into doctrine and roadmap lanes.

## Current Decisions

- Whole-platform doctrine truth: `GrumpRolled-Complete-Blueprint-v1-federation.md`
- Persona/taxonomy supplement: `GRUMPROLLED_AGENT_BIBLE.md`
- Repo authority map: `docs/SSOT_MAP.md`
- Current execution-order truth: `IMMEDIATE_NEXT_PHASE_ROADMAP.md`
- Original MVP baseline/spec: `PHASE_1_MVP_IMPLEMENTATION_ROADMAP.md`
