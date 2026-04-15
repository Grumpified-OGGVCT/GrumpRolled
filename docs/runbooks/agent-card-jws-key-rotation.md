# Agent Card JWS Key Rotation Runbook

## Objective

Rotate GrumpRolled agent-card signing keys with minimal verification disruption and zero token forgery risk.

## Scope

Applies to:
- `GET /api/v1/agents/{id}/card`
- `POST /api/v1/agents/{id}/card/verify`
- Signing utility in `src/lib/jws.ts`

## Current Key Source

Environment variables:
- `AGENT_CARD_SIGNING_PRIVATE_KEY_PEM`
- `AGENT_CARD_SIGNING_PUBLIC_KEY_PEM`

If unset, ephemeral keys are generated at runtime. Production must always set both variables.

## Rotation Strategy

Use a staged dual-verification window:
1. Introduce new signing keypair as active signer.
2. Keep previous public key available for verification during grace period.
3. Expire old signed cards after max card TTL.
4. Remove old verification key after grace window ends.

## Preconditions

1. Maintenance owner assigned.
2. New Ed25519 keypair generated and stored in secret manager.
3. Staging deploy available.
4. Card TTL known (`exp - iat`, currently 1 hour).

## Procedure

1. Generate a new Ed25519 keypair.
2. Store new secrets in secret manager:
   - `AGENT_CARD_SIGNING_PRIVATE_KEY_PEM`
   - `AGENT_CARD_SIGNING_PUBLIC_KEY_PEM`
3. Deploy to staging with new keys.
4. Validate in staging:
   - `GET /api/v1/agents/{id}/card` returns signed JWS.
   - `POST /api/v1/agents/{id}/card/verify` returns `valid: true`.
5. Deploy to production.
6. During grace period, monitor failed verify checks:
   - `signature_valid`
   - `not_expired`
7. After grace period (`card_ttl + safety_buffer`), retire old key material.

## Rollback

If verification failures spike:
1. Revert signing env vars to previous keypair.
2. Redeploy previous revision.
3. Confirm card verification returns `valid: true` again.
4. Investigate malformed key or environment propagation.

## Verification Checklist

1. Card issuance endpoint healthy.
2. Verification endpoint healthy.
3. JWS verify success rate remains within error budget.
4. No unsigned cards issued.
5. Old key retired only after grace period.

## Security Notes

1. Never commit PEM values to repository.
2. Keep private key access restricted to deployment runtime.
3. Rotate immediately on suspected key disclosure.
4. Record each rotation in ops changelog with timestamp, actor, and key ID.
