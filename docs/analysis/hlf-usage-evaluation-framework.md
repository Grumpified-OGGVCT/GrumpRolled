# HLF Usage Evaluation Framework

Date: 2026-04-05

## Purpose

Use this framework to measure what HLF actually does for a GrumpRolled slice rather than what it is expected to do in theory.

This framework is designed to track:

- claims versus observed reality
- concrete pros and cons
- where HLF improves a slice
- where HLF adds cost, confusion, or ceremony
- what expansive next improvements are worth exploring

This framework is intentionally non-reductive.
It is not an MVP minimization tool.
It is a truth-tracking surface for deciding whether HLF should grow, change shape, or be constrained in a given use case.

## Short Rule

Every HLF experiment should leave behind a record of what was claimed, what was observed, what got better, what got worse, and what richer next-step expansion is worth trying.

## Core Metrics

### 1. Claim Accuracy

- `claim_summary`: the short statement made before or during the experiment
- `observed_reality_summary`: what the repo, runtime, or workflow actually demonstrated
- `claim_accuracy`: `matched` | `partial` | `drifted` | `disproved`

### 2. Usefulness

- `usefulness_score`: 0.0 to 1.0
- `usefulness_reasons`: concrete evidence for why the score is deserved

Use this to answer: did HLF make the slice meaningfully more understandable, governable, auditable, or safer?

### 3. Legibility

- `legibility_gain_score`: 0.0 to 1.0
- `legibility_notes`: what became easier for operators, contributors, or reviewers to understand

### 4. Governance Value

- `governance_gain_score`: 0.0 to 1.0
- `governance_notes`: what became clearer about refusal, permissions, state transitions, or trust boundaries

### 5. Audit Value

- `audit_gain_score`: 0.0 to 1.0
- `audit_notes`: what became easier to inspect, explain, or preserve as evidence

### 6. Translation Value

- `translation_gain_score`: 0.0 to 1.0
- `translation_notes`: whether HLF improved NLP-to-structured reasoning, English audit output, or cross-surface explanation

### 7. Cost Surface

- `complexity_cost_score`: 0.0 to 1.0
- `maintenance_cost_score`: 0.0 to 1.0
- `runtime_cost_score`: 0.0 to 1.0
- `cost_notes`: what overhead or fragility HLF introduced

These are not “reasons to cut.”
They are reasons to understand where HLF needs expansion, stronger tooling, or better interfaces.

### 8. Pros / Cons

- `pros`: flat list of concrete wins
- `cons`: flat list of concrete drawbacks

### 9. Expansion Opportunities

- `expansion_opportunities`: flat list of non-reductive next steps

Use this field to capture richer follow-up work, such as better instrumentation, deeper integration, clearer audit lanes, stronger runtime proofs, or broader agent-facing explanations.

### 10. Recommendation

- `recommendation`: `expand` | `refine` | `contain` | `pause`
- `recommendation_reason`: one short explanation tied to evidence

## Required Evidence Fields

Every evaluation entry should include:

- `artifact_paths`: files, routes, docs, or scripts involved
- `verification`: what was actually run or checked
- `limitations`: what was not proven

## Storage Format

Write entries to:

- `artifacts/analysis/hlf-usage-evaluations.jsonl`

Use one JSON object per line.

## Workflow

1. Before the experiment, write the intended claim.
2. After implementation or review, record what actually happened.
3. Attach the concrete evidence.
4. Record pros, cons, and expansive next steps.
5. Set a recommendation based on reality, not aspiration.

## Current Starter Use Cases

Good initial slices for this framework:

- reviewed external intake
- Ask-to-Answer routing
- answer-card trust surfaces
- identity lifecycle and federation verification
- any slice where HLF is claimed to improve legibility, governance, or audit value
