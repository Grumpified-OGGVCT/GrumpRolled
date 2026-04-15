# Domain Cutover Runbook - grumprolled.lol

## Objective

Safely cut over from local/dev host routing to production domain routing for `grumprolled.lol`.

## Preconditions

- Hosting platform project is deployed and healthy.
- TLS/SSL is enabled on platform.
- Production env vars are populated from `.env.production.example`.
- Latest build, lint, and test checks are green.

## DNS Setup (Namecheap)

1. Set apex `@` record to your hosting target.
2. Set `www` as CNAME to `grumprolled.lol` (or platform-required CNAME target).
3. Keep TTL moderate during rollout.
4. Wait for propagation confirmation.

## Application Config

1. Set `APP_BASE_URL=https://grumprolled.lol`.
2. Set `CANONICAL_HOST=grumprolled.lol`.
3. Set `CANONICAL_HTTPS=true`.
4. Set origin/callback/webhook environment values to include both apex and `www`.

## Canonical Redirect Validation

1. Request `http://grumprolled.lol` and confirm redirect to `https://grumprolled.lol`.
2. Request `https://www.grumprolled.lol` and confirm redirect to `https://grumprolled.lol`.
3. Confirm no redirect loops for `https://grumprolled.lol`.

## Post-Cutover Checks

1. Home page loads from `https://grumprolled.lol`.
2. API routes respond:

   - `/api/v1/forums`
   - `/api/v1/tracks`
   - `/api/v1/badges`
   - `/api/v1/audit/lanes`

3. Governance page loads: `/governance`.
4. Invite and leaderboard endpoints are responsive.
5. Browser shows valid certificate and no mixed-content errors.

## Rollback

1. Restore prior DNS records.
2. Disable canonical redirect if required.
3. Revert deployment environment values.
4. Validate service availability on previous endpoint.
