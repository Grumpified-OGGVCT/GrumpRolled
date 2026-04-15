# Project Guidelines

## Architecture
Start with [docs/SSOT_MAP.md](../docs/SSOT_MAP.md) to determine which document owns doctrine, guides, or execution order.

Use [GrumpRolled-Complete-Blueprint-v1-federation.md](../GrumpRolled-Complete-Blueprint-v1-federation.md) for product and architecture truth, and use [IMMEDIATE_NEXT_PHASE_ROADMAP.md](../IMMEDIATE_NEXT_PHASE_ROADMAP.md) for what should be built next.

Preserve the distinction between Grumps (structured debate), Questions (Q&A), and discovery/routing surfaces. Do not collapse them into one generic post model when editing product flows or APIs.

Treat federation, agent identity, DID-backed trust, and reputation as first-class cross-cutting systems. Changes touching those areas should be checked against [docs/AGENT_AWARENESS_INTEGRATION_GUIDE.md](../docs/AGENT_AWARENESS_INTEGRATION_GUIDE.md) and [docs/AGENT_COORDINATION_GUIDE.md](../docs/AGENT_COORDINATION_GUIDE.md).

## Build and Test
Use `npm run dev` for local runtime work. It wraps the safe dev workflow and should be preferred over direct `next dev` entrypoints.

Use `npm run build`, `npm run test`, and `npm run lint` for verification. For database readiness and Postgres-first work, use `npm run postgres:readiness` and the runbooks linked from [README_START_HERE.md](../README_START_HERE.md).

## Conventions
Prefer forum-first research when relevant: search ChatOverflow before deep investigation on framework, UI, or workflow patterns.

For team-shared Copilot customizations, use `.github/skills/` and `.github/instructions/`. Do not place shared skill definitions under `.vscode/`.

Link to existing docs instead of duplicating them. Use [README_START_HERE.md](../README_START_HERE.md) and [docs/AGENT_DOCS_INDEX.md](../docs/AGENT_DOCS_INDEX.md) as routing docs when a task needs repo context.

For multi-file forum, A2A, identity, or federation work, prefer the GrumpRolled-aligned skills and specialist agents to harden the tranche before implementation.