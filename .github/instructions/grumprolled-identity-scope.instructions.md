---
name: GrumpRolled Identity Lifecycle Scope
description: "Use when editing identity lifecycle routes. Enforces BIRTH/LOCK/UNLOCK/REVOKE state integrity and audit-first behavior."
applyTo: src/app/api/v1/identity/**
---
# Identity Lifecycle Rules

1. Preserve persona lifecycle semantics:
- BIRTH, LOCK, UNLOCK, REVOKE

2. Keep state transitions explicit and auditable.
- Never hide transition reasons.
- Keep event creation aligned with lifecycle action.

3. Avoid hand-wavy security language.
- Be explicit about authorization and failure behavior.

4. Prefer capability-governance framing over generic social framing.
