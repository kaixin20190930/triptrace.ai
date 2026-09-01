# Production Provisioning Runbook

Last updated: 2026-09-01 Asia/Shanghai

Scope: `RB-301` and `PA-901`. This is the checklist for standing up fresh Cloudflare
resources for the rebuilt TripTrace.ai and recording the evidence.

Nothing in this file has been executed. Every command below creates or modifies real
cloud resources and is left for the project owner to run deliberately.

## 1. Read This First

`wrangler.jsonc` currently points at the **legacy production resources**:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "triptrace", "database_id": "af462150-…" }]
"r2_buckets":   [{ "binding": "MEDIA", "bucket_name": "triptrace-media" }]
```

Those belong to the abandoned implementation. Local development is unaffected because
Wrangler keeps a separate local database, but any command carrying `--remote`, and any
deploy, would reach the legacy production data.

Consequences to avoid:

1. Do not run `wrangler d1 migrations apply triptrace --remote` against the current
   configuration. The rebuild's migrations `0007` to `0009` would be applied to the legacy
   database.
2. Do not deploy before the bindings are repointed. The rebuilt app would read and write
   legacy rows and legacy media objects.

The decision on record is a clean cut with no reuse of legacy production data, so the
first step is creating new resources and repointing the bindings.

## 2. Create Fresh Resources

Names below are suggestions; keep whatever convention you prefer, but make the break from
the legacy names obvious.

```bash
npx wrangler d1 create triptrace-atlas
npx wrangler r2 bucket create triptrace-atlas-media
```

Record the returned `database_id`.

## 3. Repoint The Bindings

Edit `wrangler.jsonc`:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "triptrace-atlas", "database_id": "<new id>" }
],
"r2_buckets": [
  { "binding": "MEDIA", "bucket_name": "triptrace-atlas-media" }
]
```

Keep the binding names `DB` and `MEDIA`. The application resolves both by binding name.

## 4. Configure Secrets

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ADMIN_TASK_TOKEN
```

Notes:

- `OPENAI_MODEL` can stay a plain var; it is not a secret.
- `ADMIN_TASK_TOKEN` gates the analytics retention endpoint. Without it that endpoint stays
  disabled and returns `503`, which is intentional. Generate a long random value and do not
  reuse the local development one.
- No session secret is required by the current auth flow; sessions are database-backed.

## 5. Apply Migrations

```bash
npx wrangler d1 migrations list triptrace-atlas --remote
npx wrangler d1 migrations apply triptrace-atlas --remote
npx wrangler d1 migrations list triptrace-atlas --remote
```

Expect `0001` through `0009` applied, with nothing pending afterwards.

## 6. Build And Deploy

Stop `npm run dev` first. Development and production builds share `.next`, and running both
against the same directory causes chunk errors and reload loops.

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run cf:build
npm run cf:deploy
```

## 7. Smoke Test The Release Candidate

Run against the deployed URL, not localhost. Use a throwaway account and delete it
afterwards.

| # | Check | Expected |
|---:|---|---|
| 1 | `GET /api/generate-memory` | `configured: true`, provider `OpenAI` |
| 2 | `GET /api/entitlements` signed out | plan `guest`, 0 permanent traces |
| 3 | Guest generation | one draft succeeds |
| 4 | Guest generation again | `403 entitlement_guest_demo_used` |
| 5 | Sign up | `201`, session cookie set with `Secure` |
| 6 | `GET /api/entitlements` signed in | plan `free`, 3 traces, 5 generations |
| 7 | Signed-in photo upload | `201` with keys under `users/<id>/` |
| 8 | Save trace with confirmed facts | `201`, `isFirstTrace: true` |
| 9 | Save a second trace | `201`, `isFirstTrace: false` |
| 10 | Owner reads own media | `200` |
| 11 | Read same media signed out | `403` |
| 12 | Read own media from a second account | `403` |
| 13 | Fourth save on Free | `403 entitlement_trace_limit_reached` |
| 14 | `POST /api/media` with 21 files | `400 entitlement_image_limit_exceeded` |
| 15 | Delete a trace | `200`, then media returns `404` |
| 16 | `/vault`, `/timeline`, `/map` | load and open the same trace |
| 17 | `/world-land.json` | `200`, served from the app origin |
| 18 | `GET /api/admin/analytics/cleanup` without token | `403` |
| 19 | Same with the correct token | `200`, `retentionDays: 90` |
| 20 | `/`, `/explore` | indexable; `/vault`, `/timeline`, `/map` `noindex` |

Then delete the throwaway account and its rows.

The automated suite covers most of this and can be pointed at the deployment:

```bash
ADMIN_TASK_TOKEN=<production token> npm run test:api -- https://<deployment-url>
```

Be aware that it creates real accounts and traces on the target, so only run it against a
release candidate you are willing to clean up, and run `qa:cleanup` logic manually against
the remote database afterwards.

## 8. Analytics Retention In Production

Retention is enforced two ways:

1. `POST /api/admin/analytics/cleanup` with the operator token. Suitable for a scheduled
   caller.
2. An opportunistic sweep on roughly one percent of analytics writes, so the 90-day rule
   holds even with no schedule configured.

If you want a schedule, the simplest option that does not disturb the OpenNext-generated
worker is an external scheduler or a small separate Worker with a cron trigger that calls
the endpoint with the token. Decide and record the choice; do not leave it implicit.

## 9. Evidence To Record In progress.md

Paste and fill:

```text
Deployment URL:
Commit hash:
D1 database name and id:
R2 bucket name:
Migrations applied:
Secrets configured:
Smoke test result (which of the 20 checks passed):
Known issues:
```

## 10. Cost Guardrails

- Monthly alert at `$50`, hard ceiling at `$100`.
- Configure Cloudflare notifications and an OpenAI usage limit before opening access.
- The Guest allowance is one lifetime AI draft per device with an IP throttle, and Free is
  five per month, so AI spend scales with accounts rather than with raw traffic.
