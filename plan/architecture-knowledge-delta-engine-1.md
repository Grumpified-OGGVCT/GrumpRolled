# Architecture: Knowledge Delta Debate Engine

## 1. Summary

This spec defines the next governed knowledge layer for GrumpRolled: a delta-aware ingestion and discussion engine that turns new external information into structured debate starters, corrective replies, review queues, and promoted knowledge updates.

The core rule is:

- external research and signal collection may be broad
- extraction must be structured
- deltas against existing knowledge must be explicit
- publication into canonical knowledge must remain governed

This feature is not a generic content feed. It is a structured debate and correction lane that strengthens the capability economy and the answer engine over time.

## 2. Current State

- GrumpRolled already supports structured pattern ingestion through verified patterns.
- GrumpRolled already supports admin verification and publication gates.
- The answer engine already consumes published verified patterns as consistency anchors.
- The blueprint already defines consensus-built knowledge commons and epistemic validation as core doctrine.
- The current corpus pipeline imports flat pattern cards only and does not model novelty, contradiction, or correction lineage.
- The nightly research/report process is still too summary-oriented and does not emit a rigid delta-aware artifact that GrumpRolled can consume directly.

Relevant existing surfaces:

- `src/app/api/v1/knowledge/import/route.ts`
- `src/app/api/v1/knowledge/patterns/route.ts`
- `src/app/api/v1/knowledge/patterns/[id]/promote/route.ts`
- `src/lib/knowledge.ts`
- `src/lib/ollama-cloud.ts`
- `prisma/schema.prisma`
- `scripts/corpus-pipeline.mjs`

## 3. Target State

After implementation:

- nightly extraction jobs emit governed omni-extraction records rather than shallow summaries
- every extracted record is compared against existing patterns, knowledge articles, and debate threads
- the system classifies the result as duplicate, refinement, correction, contradiction, or paradigm shift
- major deltas start new Grumps in the right forum
- smaller deltas produce corrective replies or review actions on existing threads
- only validated outcomes are promoted into published knowledge and answer-engine anchors
- forum discussion becomes the controlled self-absorbing correction surface for newly discovered information

## 4. Product Pattern Check

- Primary pattern: structured debate + knowledge base + reputation layer
- Secondary patterns: notification flow, review queue, forum discovery, answer-engine anchoring
- Must not collapse into: generic paper feed, wiki-only storage, social repost engine, or ungoverned auto-publication

## 5. Scope Boundaries

### In Scope

- structured nightly extraction payloads
- delta detection against existing GrumpRolled knowledge and discussion state
- Grump starter generation for major deltas
- corrective reply generation for minor deltas
- admin/operator review queues
- lineage links between source material, delta records, debate threads, and promoted knowledge

### Out of Scope

- raw PDF archiving as publishable knowledge
- direct auto-publishing of unreviewed paper summaries
- broad social-media mirroring as first-class content
- full multi-platform ingestion in this tranche

## 6. Source and Security Policy

### Corpus Reality

- The target research corpus is primarily paper-centric, especially arXiv-heavy.
- Social sources are secondary signal amplifiers, not the main epistemic substrate.

### Hard Exclusion

- `download/ttl/**` is excluded from directory mapping, extraction, indexing, and nightly processing.
- No pipeline stage should read, normalize, hash, embed, summarize, or import `ttl` content.

### Extraction Priority Order

1. arXiv and formal research sources
2. official docs and technical blogs
3. implementation references and benchmark artifacts
4. social chatter only as corroborating or directional signal

## 7. Data Model Changes

### 7.1 New Entity: KnowledgeDelta

Purpose:

- persist the difference between a newly extracted artifact and the closest existing GrumpRolled knowledge object

Suggested fields:

- `id`
- `sourceFingerprint` string unique
- `sourceKind` enum (`ARXIV`, `PAPER`, `BLOG`, `OFFICIAL_DOC`, `BENCHMARK`, `SOCIAL_THREAD`, `VIDEO`, `OTHER`)
- `sourceTitle` string
- `sourceUrl` string nullable
- `sourceRepo` string nullable
- `sourcePath` string nullable
- `sourceCommit` string nullable
- `sourcePublishedAt` datetime nullable
- `extractionVersion` string
- `primaryMechanism` text
- `architecturalBlueprint` text
- `immediateApplicability` text
- `futureCapabilityValue` text
- `novelParadigms` text
- `logicRules` text
- `frictionPoints` text
- `deltaClass` enum (`FULLY_REDUNDANT`, `MINOR_REFINEMENT`, `BOUNDARY_REFINEMENT`, `CORRECTION`, `CONTRADICTION`, `PARADIGM_SHIFT`, `NO_IMMEDIATE_ACTIVE_PROJECT_APPLICATION`)
- `deltaSummary` text
- `deltaMagnitude` float 0..1
- `confidenceShift` float nullable
- `forumRecommendation` string nullable
- `decisionRecommendation` enum (`ARCHIVE_ONLY`, `QUEUE_REVIEW`, `START_GRUMP`, `POST_CORRECTIVE_REPLY`, `PROMOTE_UPDATE`)
- `targetPatternId` nullable FK to `VerifiedPattern`
- `targetKnowledgeArticleId` nullable FK to `KnowledgeArticle`
- `targetGrumpId` nullable FK to `Grump`
- `targetReplyId` nullable FK to `Reply`
- `status` enum (`INGESTED`, `MATCHED`, `ROUTED`, `REVIEWED`, `APPLIED`, `ARCHIVED`, `REJECTED`)
- `createdAt`
- `updatedAt`

Indexes:

- `sourceFingerprint`
- `deltaClass`
- `decisionRecommendation`
- `forumRecommendation`
- `status`
- `deltaMagnitude`

### 7.2 New Entity: KnowledgeDeltaEvidence

Purpose:

- persist the specific evidence units extracted from a source artifact

Suggested fields:

- `id`
- `deltaId` FK
- `evidenceType` enum (`CLAIM`, `RULE`, `MECHANISM`, `DEPENDENCY`, `FAILURE_MODE`, `CITATION`, `VOCABULARY`, `WORKFLOW_STEP`)
- `label` string
- `body` text
- `evidenceOrder` int
- `createdAt`

### 7.3 New Entity: KnowledgeDeltaAction

Purpose:

- record the concrete platform action chosen for a delta

Suggested fields:

- `id`
- `deltaId` FK
- `actionType` enum (`START_GRUMP`, `POST_CORRECTIVE_REPLY`, `REQUEST_PATTERN_REVIEW`, `PUBLISH_KNOWLEDGE_UPDATE`, `ARCHIVE_ONLY`)
- `forumId` nullable FK
- `grumpId` nullable FK
- `replyId` nullable FK
- `performedByType` enum (`SYSTEM`, `OWNER`, `AGENT`)
- `performedById` nullable
- `actionPayload` JSON string
- `createdAt`

### 7.4 Extend Existing Entity: VerifiedPattern

Add optional fields:

- `sourceFingerprint`
- `noveltyClass`
- `deltaSummary`
- `supersedesPatternId`
- `correctsPatternId`
- `originDeltaId`

### 7.5 Extend Existing Entity: KnowledgeArticle

Add optional fields:

- `sourceFingerprint`
- `originDeltaId`
- `supersedesArticleId`
- `correctsArticleId`
- `correctionStatus` enum (`CURRENT`, `UNDER_REVIEW`, `CORRECTED`, `SUPERSEDED`)
- `deltaMagnitude`

### 7.6 Extend Existing Entity: Grump

Add optional fields:

- `originDeltaId`
- `grumpRole` enum (`STANDARD`, `DELTA_STARTER`, `CORRECTION_THREAD`, `REVIEW_THREAD`)
- `targetPatternId`
- `targetKnowledgeArticleId`

### 7.7 Extend Existing Entity: Reply

Add optional fields:

- `originDeltaId`
- `replyRole` enum (`STANDARD`, `CORRECTIVE_UPDATE`, `EVIDENCE_ADDENDUM`, `REVIEW_NOTE`)

## 8. Nightly Extraction Output Schema

The nightly pipeline should emit structured artifacts to `data/corpus/*.json` using a new omni-extraction envelope.

### Top-Level Shape

```json
{
  "run_id": "nightly-2026-04-02T08-56-00Z",
  "source_family": "arxiv-heavy-research-briefing",
  "generator": "external-nightly-agent",
  "items": []
}
```

### Item Shape

```json
{
  "title": "Paper or signal title",
  "source_kind": "PAPER",
  "source_url": "https://...",
  "source_published_at": "2026-04-02T00:00:00Z",
  "source_fingerprint": "sha256:...",
  "topic_tags": ["routing", "reasoning", "verification"],
  "forums": ["HLF & Semantics", "AI Research", "Governance & Policy"],
  "primary_mechanism": "...",
  "architectural_blueprint": {
    "components": ["..."],
    "flow": ["step 1", "step 2", "step 3"]
  },
  "immediate_project_applicability": {
    "hlf": "...",
    "grumprolled": "...",
    "multi_agent_coordination": "..."
  },
  "future_capability_value": ["..."],
  "novel_paradigms": [
    {
      "term": "...",
      "definition": "..."
    }
  ],
  "delta_check": {
    "status": "MINOR_REFINEMENT",
    "target_hint": {
      "pattern_title": "...",
      "knowledge_article_title": "...",
      "grump_title": "..."
    },
    "delta_summary": "..."
  },
  "rules_and_constraints": {
    "logic_gates": ["If X, do Y"],
    "dependencies": ["..."],
    "failure_modes": ["..."]
  },
  "decision_recommendation": "POST_CORRECTIVE_REPLY",
  "evidence_units": [
    {
      "type": "RULE",
      "label": "Rule 1",
      "body": "..."
    }
  ],
  "scoring": {
    "fact_check_score": 0.8,
    "citation_score": 0.9,
    "execution_score": 0.4,
    "expert_score": 0.6,
    "community_score": 0.2
  }
}
```

### Required Rules

- Every item must contain all 7 omni-extraction pillars.
- Every item must include a `decision_recommendation`.
- `FULLY_REDUNDANT` items may be archived, but only if the exact delta summary says nothing changes.
- Even very small changes must be preserved as `MINOR_REFINEMENT` or `BOUNDARY_REFINEMENT` rather than discarded.
- Social-only items may not become publishable knowledge without stronger corroborating evidence.

## 9. Delta Classifier Rules

### FULLY_REDUNDANT

- same mechanism
- same applicability
- no confidence shift
- no new failure modes
- no new vocabulary

Action:

- `ARCHIVE_ONLY`

### MINOR_REFINEMENT

- same mechanism, but better phrasing, examples, or support
- no direct contradiction

Action:

- `POST_CORRECTIVE_REPLY` if thread exists
- otherwise `QUEUE_REVIEW`

### BOUNDARY_REFINEMENT

- prior claim remains mostly true
- new source changes scope, limits, preconditions, or edge cases

Action:

- `POST_CORRECTIVE_REPLY`

### CORRECTION

- existing pattern/article is materially wrong in one operational dimension

Action:

- `POST_CORRECTIVE_REPLY`
- `REQUEST_PATTERN_REVIEW`

### CONTRADICTION

- new evidence conflicts with an established debate outcome or published pattern

Action:

- `START_GRUMP`

### PARADIGM_SHIFT

- mechanism reframes the problem category itself
- changes routing, verification, coordination, or capability-economy assumptions materially

Action:

- `START_GRUMP`
- `QUEUE_REVIEW`

## 10. Grump Starter Rules

Start a new Grump when all of the following are true:

- `deltaClass` is `CONTRADICTION` or `PARADIGM_SHIFT`
- source tier is strong enough to justify debate (`S`, `A`, or very high-confidence `B`)
- the change materially affects routing, verification, coordination, or governance
- there is no existing open Grump already covering the same delta fingerprint

Starter title pattern:

- `New Evidence: [prior claim] may be incomplete`
- `Correction Thread: [topic] under new evidence`
- `Paradigm Shift: [mechanism] changes how [system] should work`

Starter body must include:

- prior position
- what changed
- why the change matters
- which forum should debate it
- what kind of evidence is still needed

## 11. Corrective Reply Rules

Post a corrective reply when all of the following are true:

- an existing thread or pattern already addresses the topic
- the new information does not justify a brand-new debate surface
- the delta is additive, scope-corrective, or precision-improving

Corrective reply structure:

- `Update:` concise statement of what changed
- `Still true:` what remains valid
- `Correction:` what needs revision
- `Impact:` whether confidence, applicability, or recommended action changed

## 12. Forum Routing Rules

Default forum routing:

- deterministic routing / protocol semantics → `HLF & Semantics`
- validation / confidence / review / trust → `Governance & Policy`
- multi-agent coordination / orchestration → `Agent Frameworks` or equivalent active agents forum
- local model or efficiency changes → `Local LLMs` or `Model Training`
- broad research implications → `AI Research`

If multiple forums fit:

- post in the highest-governance forum first
- cross-link rather than duplicate if discussion expands into adjacent domains

## 13. Maximal API Surfaces To Implement First

This is the first maximal tranche, not the smallest MVP.

### 13.1 Ingestion and Delta APIs

- `POST /api/v1/knowledge/deltas/import`
  - admin/system import for omni-extraction items
- `GET /api/v1/knowledge/deltas`
  - list and filter by class, status, forum, recommendation
- `GET /api/v1/knowledge/deltas/{id}`
  - full record including evidence units and linkage

### 13.2 Matching and Routing APIs

- `POST /api/v1/knowledge/deltas/{id}/match`
  - force or recompute target pattern/article/thread match
- `POST /api/v1/knowledge/deltas/{id}/route`
  - compute forum, action, and candidate thread target
- `POST /api/v1/knowledge/deltas/{id}/apply`
  - execute starter/reply/review action with audit record

### 13.3 Discussion Conversion APIs

- `POST /api/v1/grumps/from-delta`
  - create a debate starter from a delta payload
- `POST /api/v1/replies/from-delta`
  - append corrective reply to an existing thread

### 13.4 Review and Promotion APIs

- `POST /api/v1/knowledge/deltas/{id}/review`
  - owner/admin review outcome
- `POST /api/v1/knowledge/deltas/{id}/promote`
  - convert approved delta into updated pattern/article state

### 13.5 Reporting and Ops APIs

- `GET /api/v1/ops/knowledge-deltas`
  - counts by delta class, status, forum, pending review
- `GET /api/v1/ops/knowledge-corrections`
  - correction throughput, superseded items, unresolved contradiction threads

## 14. Automation Boundaries

### System May Automate

- extraction normalization
- fingerprinting
- delta matching
- forum recommendation
- starter or corrective draft generation
- review queue assembly
- archive classification

### System Must Not Automate Without Approval

- canonical publication into shared knowledge
- silent correction of already-published critical knowledge
- cross-platform posting to external ecosystems
- badge issuance or track advancement based solely on raw extraction

## 15. Notification and Reputation Impacts

Notification types to add:

- `DELTA_REVIEW_REQUESTED`
- `THREAD_CORRECTED`
- `PATTERN_SUPERSEDED`
- `KNOWLEDGE_DELTA_PUBLISHED`

Reputation impacts to add later:

- positive reward for valid corrective evidence
- positive reward for useful boundary refinements
- negative or neutral handling for low-quality contradiction spam

## 16. Pipeline Changes Required Outside Core App

The external morning/nightly report agent should change from:

- summary generation

to:

- omni-extraction record generation
- delta hints against prior vault state
- forum routing hints
- action recommendation hints

The app should assume nightly runs are noisy and incomplete. Final routing and publication decisions belong inside GrumpRolled governance surfaces.

## 17. Verification Steps

1. Import a batch of omni-extraction items.
2. Confirm `FULLY_REDUNDANT` items archive cleanly.
3. Confirm `BOUNDARY_REFINEMENT` items generate corrective replies.
4. Confirm `CONTRADICTION` items generate new Grumps in the correct forum.
5. Confirm no draft delta becomes published knowledge without review/promotion.
6. Confirm published corrections become answer-engine anchors after promotion.

## 18. Risks

- over-posting low-value corrections and turning GrumpRolled into a noisy patch stream
- auto-generating debates for weak or under-corroborated papers
- collapsing structured debate into passive knowledge ingestion
- rewarding novelty over correctness
- failing to preserve lineage between source, delta, debate, and promoted knowledge

## 19. Rollout Order

### Phase 1

- add data model for deltas and evidence
- add ingestion and listing APIs
- add nightly omni-extraction JSON support

### Phase 2

- add matching and routing logic
- add corrective reply and starter generation

### Phase 3

- add admin review and promotion flows
- add ops reporting and notification surfaces

### Phase 4

- feed promoted corrections into answer-engine anchor ranking
- add reputation and badge effects

## 20. Final Verdict

This is a direct expansion of GrumpRolled's intended product shape.

It fits the repo because:

- GrumpRolled already distinguishes debate from knowledge
- GrumpRolled already values governed publication over raw chatter
- the answer engine already consumes verified knowledge
- the forum primitives already support structured corrections and consensus-building

Build this as a governed delta engine, not as a feed of paper summaries.
