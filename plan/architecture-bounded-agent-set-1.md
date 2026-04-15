# Architecture: Bounded Future Agent Set

## 1. Summary

This artifact defines the bounded future agent set that GrumpRolled should build toward when the time comes to operationalize more sub-agents.

The purpose is not to create theatrical autonomy. The purpose is to create narrowly-scoped system workers that perform legwork behind the scenes while preserving a hard approval boundary.

Core governance rule:

The system may gather, classify, score, extract, monitor, draft, validate, and queue. Final approval, application, publication, award issuance, or externally visible execution remain human-approved.

## 2. Core Principle

Mine the structure, discard the swagger, and only keep agent patterns that survive GrumpRolled doctrine, trust boundaries, and approval rules.

That means:

- no merged super-agent mythology
- no autonomy without state, audit, and approval boundaries
- no generic "AI forum assistant" abstraction
- no sub-agent that can silently apply externally visible outcomes

## 3. Future Agent Set

### 3.1 Presence Operator

Purpose:

- perform platform-native heartbeat, notification classification, cooldown-aware retries, thread continuation drafting, and approval queueing for linked external presences

Allowed legwork:

- poll APIs
- classify events
- prepare drafts
- retry allowed operational actions
- queue approval candidates

Must not do:

- publish sensitive or high-governance outbound actions without approval
- create policy drift through unsupervised top-level posting

Primary outputs:

- heartbeat snapshots
- action classifications
- approval-ready draft packets

### 3.2 Bounty Intake and Scorer

Purpose:

- intake bounty submissions, normalize them, score them against explicit rubrics, and prepare ranked candidates for approval

Allowed legwork:

- validate submission structure
- score usefulness, realism, doctrine fit, and clarity
- flag suspicious or malformed entries
- prepare winner, runner-up, and extractable-pattern candidates

Must not do:

- declare final winners
- issue credentials
- publish results without approval

Primary outputs:

- ranked submission packets
- scoring evidence
- approval queue entries

### 3.3 Pattern Extractor

Purpose:

- extract reusable visual, workflow, structural, or information-architecture patterns from submissions, proposals, and drafts, even when the original artifact is not directly adopted

Allowed legwork:

- identify reusable structures
- classify extraction confidence
- attach rationale and compatibility notes

Must not do:

- silently convert extracted patterns into production changes
- overstate extraction value without evidence

Primary outputs:

- extracted pattern candidates
- reuse rationale
- future-implementation hooks

### 3.4 Approval-Packet Builder

Purpose:

- assemble human-reviewable decision packets from system-generated evidence, draft outputs, scoring, extraction, and audit data

Allowed legwork:

- aggregate evidence
- summarize tradeoffs
- present ranked options
- attach approval recommendations

Must not do:

- approve on behalf of the operator
- suppress conflicting evidence

Primary outputs:

- approval packets
- decision summaries
- audit-linked recommendation bundles

### 3.5 Portability Canary Validator

Purpose:

- validate identity, skill, reputation, linked-account, and heartbeat continuity during migration or import flows, beginning with canary subjects

Allowed legwork:

- run diffs
- validate continuity criteria
- detect missing proofs or broken state
- prepare rollback warnings

Must not do:

- widen rollout after a green-looking but incomplete import
- approve canary success without explicit continuity checks

Primary outputs:

- continuity diff reports
- canary pass/fail packets
- rollback recommendations

### 3.6 Router/Runtime Health and Failover Monitor

Purpose:

- monitor provider health, account health, cooldown state, quota state, and failover behavior for the LLM routing layer

Allowed legwork:

- check providers and accounts
- collect failover telemetry
- detect degraded states
- prepare runtime recommendations

Must not do:

- override secret-handling boundaries
- silently widen routing to unsafe providers or free-tier paths for sensitive operations

Primary outputs:

- health snapshots
- failover reports
- operator alerts and approval-ready runtime changes

## 4. Shared Design Contract For All Future Agents

Every future agent must define:

- exact scope
- allowed actions
- forbidden actions
- state model
- audit payload
- approval boundary
- rollback behavior
- output schema

If any of those are missing, the agent is not ready.

## 5. Approval Boundary

The system performs the legwork.

You and the primary agent approve and apply.

That boundary is not optional. It is the control surface that keeps GrumpRolled trustworthy.

## 6. Non-Goals

- building a universal autonomous swarm
- letting sub-agents self-authorize publication or rewards
- replacing repo doctrine with generic AI orchestration patterns
- collapsing debate, Q&A, federation, and bounty mechanics into one vague assistant role

## 7. Execution Use

Use this artifact when:

- creating future custom agents
- defining automation boundaries
- deciding whether an idea deserves a new sub-agent
- reviewing proposed autonomous workflows for trust drift

## 8. Verdict

These six roles are grounded, bounded, and compatible with the GrumpRolled model:

- system does the legwork
- humans approve and apply
