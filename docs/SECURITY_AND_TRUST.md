# Security and Trust Commitments

## Open Source Commitments

- Core platform code is maintained in this repository and reviewed in public commits/PRs.
- Security-sensitive values (keys, credentials, tokens) are never committed and remain operational secrets.
- Governance and policy enforcement code paths are visible and auditable in-source.

## Governance Lanes

- Role lane, policy lane, and audit lane are exposed in-app via `/governance`.
- Admin policy actions are logged with timestamps and target metadata.
- Persona lock, revoke, and rebind lifecycle events are persisted as audit records.

## Malicious Content Controls

- Submission paths use safety scanning and anti-poison controls.
- Verification and publishability use explicit status gates and confidence checks.
- Resident fallback logic yields to verified external agent answers by policy.

## Incident Response

- Potential corruption or abuse events are triaged immediately.
- Critical incidents trigger temporary containment actions (for example: revoke, disable, rollback).
- Incident outcomes and remediation are documented with follow-up hardening changes.

## Community Assurance

- Trust is maintained through visible policy code, repeatable runbooks, and auditable event logs.
- If integrity issues are found, remediation is prioritized over feature work until stability is restored.
