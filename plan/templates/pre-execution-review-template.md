# Pre-Execution Review Template

Use this template before implementation begins on any major feature, refactor, platform workflow, bounty program, federation surface, or automation system.

The goal is to force architecture, QA, security, operational, and governance review before code execution.

---

## 1. Artifact Summary

- Title:
- Owner:
- Date:
- Related plan or spec:
- Status:
- Scope type:
  - feature
  - refactor
  - workflow
  - forum/A2A
  - federation
  - bounty/credential
  - runtime/router

## 2. Current State

- What exists today:
- What is missing:
- Current constraints:
- Existing files, systems, or routes involved:

## 3. Target State

- What should exist after execution:
- User-visible outcomes:
- Operator-visible outcomes:
- Data or system state changes:

## 4. Product Pattern Check

- Primary pattern:
  - social feed
  - Q&A
  - structured debate
  - Ask-to-Answer overlay
  - reputation/identity
  - bounty/credential lane
  - tooling/admin workflow
- Secondary patterns:
- Why this classification is correct:
- What patterns must NOT be conflated:

## 5. Architecture Review

- System boundaries:
- Data ownership:
- State transitions:
- Interface boundaries:
- Extensibility concerns:
- Failure domains:
- Rollout dependencies:

### Architecture Verdict

- Strengths:
- Weak points:
- Required changes before execution:

## 6. QA Review

- Edge cases:
- Race conditions:
- Partial-failure scenarios:
- Notification/delivery failure cases:
- Invalid-input cases:
- Recovery expectations:
- Manual test scenarios:
- Automated test candidates:

### QA Verdict

- Highest-risk gaps:
- Required test coverage before rollout:

## 7. Security and Abuse Review

- Authentication or identity risks:
- Authorization risks:
- Spam/abuse vectors:
- Trust and impersonation risks:
- Secrets or credential exposure risks:
- Data leakage risks:
- Auditability requirements:

### Security Verdict

- Critical risks:
- Required mitigations before execution:

## 8. Operations Review

- Rate limits:
- Retries and backoff:
- Cooldowns or circuit breakers:
- Observability and logging:
- Analytics requirements:
- Rollback path:
- Recovery actions:
- Background job or queue implications:

### Operations Verdict

- Operational gaps:
- Required instrumentation before rollout:

## 9. Automation vs Approval Boundary

- What should be fully automated:
- What should be auto-scored or auto-extracted:
- What should generate drafts only:
- What requires explicit human approval:
- What must never be automated:

### Approval Rule

State the final boundary clearly. Example:

"The system may intake, classify, score, rank, extract patterns, and prepare approval candidates automatically. Final approval, adoption, credential issuance, and externally visible application remain human-approved."

## 10. Execution Plan

### Phase 1: Types and Interfaces

- [ ]
- Verify:

### Phase 2: Core Implementation

- [ ]
- Verify:

### Phase 3: Integration

- [ ]
- Verify:

### Phase 4: Validation and Rollout

- [ ]
- Verify:

## 11. Risks and Rollback

- Risk 1:
- Risk 2:
- Risk 3:

### Rollback Steps

1.
2.
3.

## 12. Final Pre-Execution Verdict

- Execution-ready: yes/no
- Blocking issues:
- Recommended next action:
- Required approver:
