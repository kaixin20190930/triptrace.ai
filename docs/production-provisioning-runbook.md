# Production Provisioning Runbook

Last updated: 2026-09-15 Asia/Shanghai

Scope: `RB-301`, `PA-901`, the Stripe account, and the legal review. These are the tasks an
agent must not perform unprompted, because they create real resources, spend real money, or
require professional judgement.

Nothing in this file has been executed. Every command that changes something is left for the
project owner to run deliberately.

## 0. Verified Current State

**Steps 1 through 8 are complete as of 2026-09-15.** They are kept below as the record of how the
current setup came about, and because steps 9 onwards have not been done. Verified end state:

| Fact | Value |
|---|---|
| Cloudflare account | `liukai19911010@gmail.com`, id `23e53b75ddd6ee2d8b80031f6a1e45e0` |
| Worker | `triptrace-ai-next`, `workers_dev` enabled, route `triptrace.ai/*` |
| Apex | `https://triptrace.ai` serves the Worker; `www` 301s to it |
| Fallback URL | `https://triptrace-ai-next.liukai19911010.workers.dev` |
| D1 | `triptrace-atlas`, id `0d56a659-0aa9-4eb2-adca-8a150c212ee0`, migrations `0001`–`0012` |
| R2 | `triptrace-atlas-media` |
| Secrets | `OPENAI_API_KEY`, `ADMIN_TASK_TOKEN` |
| Smoke test | 26 of 27, 1 skipped by design, run against the apex |
| Legacy D1 `triptrace` | **deleted** 2026-09-15, backed up first |
| Legacy R2 `triptrace-media` | **deleted** 2026-09-15, backed up first |
| Legacy Pages project `triptrace-ai` | **deleted** 2026-09-15 |

Backups of the deleted legacy resources are outside the repository at
`~/triptrace-legacy-backup-2026-09-15/`, and the SQL dump was verified by replaying it into a
scratch SQLite database and confirming it restores 5 users and 8 memories.

Two things remain untidy rather than broken. The apex is served by a route instead of a custom
domain, because the retired Pages project left a DNS record behind and a custom domain refuses a
hostname that already has externally managed records; fixing it needs a token with DNS edit
scope. And Stripe, legal review, and real-photo acceptance are all still outstanding.

### Original assessment, kept for the record

At the time this runbook was written, `wrangler.jsonc` still bound `DB` and `MEDIA` to the legacy
resources, which held 5 real users and 8 memories on the old schema. Two commands would have done
damage: a `--remote` migration against `triptrace`, or a deploy that served the rebuilt app
against legacy rows and wrote new ones beside them. Both hazards are gone now that the legacy
resources are.

## 1. Back Up The Legacy Data First

Even though the plan is not to reuse it, back it up before touching anything. It contains
real accounts and eight memories.

```bash
mkdir -p ~/triptrace-legacy-backup
npx wrangler d1 export triptrace --remote --output ~/triptrace-legacy-backup/triptrace-legacy-$(date +%Y%m%d).sql
```

Verify the file is not empty and contains `INSERT INTO users`:

```bash
ls -lh ~/triptrace-legacy-backup/
grep -c "INSERT INTO" ~/triptrace-legacy-backup/triptrace-legacy-*.sql
```

The legacy photos live in the `triptrace-media` bucket. There is no bulk download command, so
if those images matter, list and fetch them individually:

```bash
npx wrangler r2 object get triptrace-media/<key> --file ./<name>.jpg --remote
```

Keep the backup outside this repository. It is gitignored nowhere, and it contains personal
data.

## 2. Refresh The Wrangler Token

The current token is missing some scopes and Wrangler warns about it. Refresh before creating
resources, so a half-finished creation does not fail on a permission error:

```bash
npx wrangler logout
npx wrangler login
npx wrangler whoami
```

Confirm the account id still reads `23e53b75ddd6ee2d8b80031f6a1e45e0`.

## 3. Create Fresh Resources

Names are namespaced to avoid colliding with the other projects already in this account
(`sigoo`, `pairvu`, `flux-ai`, and others) and to make the break from the legacy names
obvious.

```bash
npx wrangler d1 create triptrace-atlas
npx wrangler r2 bucket create triptrace-atlas-media
```

Record the `database_id` printed by the first command. Then confirm both exist:

```bash
npx wrangler d1 list | grep triptrace
npx wrangler r2 bucket list | grep triptrace
```

You should now see both the legacy pair and the new pair. Do not delete the legacy pair yet.

## 4. Repoint The Bindings

Edit `wrangler.jsonc`:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "triptrace-atlas", "database_id": "<new id from step 3>" }
],
"r2_buckets": [
  { "binding": "MEDIA", "bucket_name": "triptrace-atlas-media" }
]
```

Two things matter more than they look:

- **Replace the existing entries, do not add new ones.** The application resolves storage by
  binding name. A second R2 entry pointing at the new bucket under a different binding is
  ignored by every code path, and `MEDIA` would quietly keep writing to the legacy bucket.
- **Do not add `"remote": true`.** On a binding that flag means *local development uses the
  real remote resource*. With it set, `npm run dev` and the whole test suite would read and
  write production, and the suites create and delete accounts.

Then prove the change took effect. Run all four checks and read every line of output:

```bash
# 1. No legacy D1 id anywhere.
grep -c "af462150-c240-4e1b-9552-a9245d501155" wrangler.jsonc

# 2. No legacy bucket name anywhere.
grep -c '"triptrace-media"' wrangler.jsonc

# 3. No remote-binding flags.
grep -c '"remote"' wrangler.jsonc

# 4. Exactly one D1 and one R2 binding, pointing where you expect.
node -e "const c=require('fs').readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/gm,'');const j=JSON.parse(c);console.log(j.d1_databases);console.log(j.r2_buckets)"
```

The first three must all print `0`. The fourth must show one D1 binding named `DB` on
`triptrace-atlas` and one R2 binding named `MEDIA` on `triptrace-atlas-media`, and nothing
else. This is the most important check in this runbook.

Changing `database_id` also makes Wrangler create a fresh **local** database, and changing the
bucket name a fresh local bucket. Your previous local development data stays on disk under the
old identifiers but is no longer used. That is harmless, and arguably a clean slate, but it
does mean the local Atlas will look empty the first time you run `npm run dev` afterwards.

## 5. Apply Migrations To The New Database

```bash
npx wrangler d1 migrations list triptrace-atlas --remote
npx wrangler d1 migrations apply triptrace-atlas --remote
npx wrangler d1 migrations list triptrace-atlas --remote
```

Expect `0001` through `0012` applied and nothing pending. Confirm the tables landed:

```bash
npx wrangler d1 execute triptrace-atlas --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expect `analytics_events`, `comments`, `d1_migrations`, `feedback`, `media_cleanup_queue`,
`memories`, `rate_limits`, `sessions`, `share_links`, `stripe_events`, `subscriptions`,
`usage_counters`, `users`.

## 6. Configure Secrets

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ADMIN_TASK_TOKEN
```

Generate the admin token with something unguessable and do not reuse the local placeholder:

```bash
openssl rand -base64 32
```

Notes:

- `OPENAI_MODEL` is not a secret. Add it to `vars` in `wrangler.jsonc` if you want to pin it;
  the code defaults to `gpt-5.2`.
- Without `ADMIN_TASK_TOKEN` the analytics retention and media cleanup endpoints stay disabled
  and return `503`. That is a safe state, but retention then relies only on the opportunistic
  sweep.
- Stripe secrets come later, in step 9. The app runs fine without them: checkout reports
  itself unavailable and the webhook refuses every delivery.

Verify the names landed, which does not reveal the values:

```bash
npx wrangler secret list
```

## 7. Build And Deploy

Stop `npm run dev` first. Development and production builds share `.next`, and running both
against it corrupts chunks.

```bash
npm run test:all
npm run build
npm run cf:build
npm run cf:deploy
```

`npm run test:all` runs lint, type checking, the eight unit suites, and the four HTTP suites
against a throwaway local server. If it fails, stop; do not deploy.

Expect a `*.workers.dev` URL from the deploy. Record it.

Cost expectation: Workers Paid is `$5/month` for the account, which OpenNext needs for Durable
Objects. D1 and R2 usage at this stage is inside the included allowances. Measured AI cost is
about `$0.009` per photo draft and `$0.0024` per text draft, so the `$50` alert is far away.

## 8. Smoke Test The Deployment

Run against the deployed URL. Use a throwaway account and delete it at the end.

| # | Check | Expected |
|---:|---|---|
| 1 | `GET /api/generate-memory` | `configured: true`, provider `OpenAI` |
| 2 | `GET /api/entitlements` signed out | plan `guest`, 0 permanent traces |
| 3 | Guest generation | one draft succeeds |
| 4 | Guest generation again | `403 entitlement_guest_demo_used` |
| 5 | Sign up | `201`, session cookie has `Secure` |
| 6 | `GET /api/entitlements` signed in | plan `free`, 3 traces, 5 generations |
| 7 | Import 40 photos | grouped into candidate traces |
| 8 | Signed-in photo upload | `201`, keys under `users/<id>/` |
| 9 | Save with confirmed facts | `201`, `isFirstTrace: true` |
| 10 | Save a second trace | `201`, `isFirstTrace: false` |
| 11 | Owner reads own media | `200` |
| 12 | Same media signed out | `403` |
| 13 | Same media from a second account | `403` |
| 14 | Fourth save on Free | `403 entitlement_trace_limit_reached` |
| 15 | `POST /api/media` with 21 files | `400 entitlement_image_limit_exceeded` |
| 16 | Create a share link, open it signed out | trace visible, photos load |
| 17 | Revoke the link | page and photos both stop working |
| 18 | Delete a trace | `200`, then its media returns `404` |
| 19 | `GET /api/export` | complete JSON |
| 20 | `GET /api/export/archive` | a ZIP that opens |
| 21 | Delete the account | `200`, cannot sign in afterwards |
| 22 | `/vault`, `/timeline`, `/map`, `/plan` | load, and are `noindex` |
| 23 | `/world-land.json` | `200` from your own origin |
| 24 | `/privacy`, `/terms` | load, linked in the footer |
| 25 | `POST /api/billing/webhook` unsigned | `400 stripe_missing_signature`, or `503 billing_not_configured` before Stripe exists |
| 26 | Admin endpoints without token | `403`, or `503` if unset |
| 27 | `/`, `/explore` | indexable |

All of the above except check 7 is automated. Check 7 is photo grouping, which runs in the
browser and has no server endpoint, so it stays a manual step covered at unit level by
`npm run test:clustering`.

```bash
npm run test:smoke -- https://<deployment-url> --with-ai
```

`--with-ai` spends real credit on checks 3 and 4, a fraction of a cent for a text draft, and it
is the only way to prove the production key works rather than merely that it is present.

The script creates two throwaway accounts, exercises the limits against the real database, and
deletes both at the end. Confirm the database is back where it started afterwards:

```bash
npx wrangler d1 execute DB --remote --command "SELECT (SELECT COUNT(*) FROM users) u,(SELECT COUNT(*) FROM memories) m;"
```

The broader suites can also be pointed at a deployment, but they were written for a local server
and leave more behind, so prefer the smoke script for anything you have to clean up by hand.

## 9. Stripe

Do this only after step 8 passes. Until then the app is correct to report billing as
unavailable.

### 9.1 Account And Products

1. Create a Stripe account and stay in **test mode** for everything below.
2. Complete the business profile enough to obtain API keys.
3. Create one product, `Founding Plus`, with two recurring prices:
   - `$9.99` monthly
   - `$79` yearly
4. Copy both price ids. They look like `price_...` and are not secrets.
5. Do not change these figures. They are a fixed product decision on record.

### 9.2 Webhook

1. Add an endpoint at `https://<deployment-url>/api/billing/webhook`.
2. Subscribe to exactly these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Copy the signing secret, which starts with `whsec_`.

### 9.3 Secrets

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_FOUNDING_MONTHLY
npx wrangler secret put STRIPE_PRICE_FOUNDING_ANNUAL
npm run cf:deploy
```

Order matters: create the prices and the webhook first, then set the secrets, then redeploy.
A half-configured deployment reports billing as unavailable rather than failing oddly, which
is the intended behaviour but is confusing if unexpected.

### 9.4 Test-Mode Verification

Follow section 11.3 of `docs/manual-testing-guide.md`. The essentials:

1. Start a monthly checkout from `/plan` and pay with card `4242 4242 4242 4242`.
2. Confirm the plan becomes Founding Plus only after the webhook arrives, not on return.
3. Confirm `/api/entitlements` then reports 500 traces and 50 monthly drafts.
4. Repeat with the annual price.
5. Cancel in the customer portal and confirm the account returns to Free while keeping read,
   export, and delete rights.
6. Resend a delivered event from the Stripe dashboard and confirm the response reports
   `duplicate` without changing state.

Only after all of that passes should live keys replace the test keys.

### 9.5 Before Taking Real Money

- Configure Stripe Tax, or decide explicitly that you are not collecting tax yet.
- Set a billing alert on the Cloudflare account and a usage limit on the OpenAI account, so the
  `$50` alert and `$100` ceiling are enforced by the providers rather than by attention.
- Decide what `Founding` means, since the price is explicitly not locked for life. The terms
  page currently says pricing may change with notice; keep that promise or change the wording
  before selling.

## 10. Legal Review

`/privacy` and `/terms` exist and are factually accurate against the code, but they have not
been reviewed. Both carry a visible line saying so. Do not remove that line yourself.

What to ask a lawyer for, in order of value:

1. A review of the privacy notice against UK GDPR, EU GDPR, and CCPA, given that users are in
   the US and Europe while the operator is not.
2. Confirmation of the lawful bases named: contract for running the service, legitimate
   interest for abuse prevention, consent for analytics.
3. A data processing position on OpenAI and Cloudflare as sub-processors, including
   international transfer wording.
4. A review of the terms, particularly the limitation of liability, the cancellation terms, and
   the minimum age of 16.
5. Whether a cookie or consent banner is required. The product sets no advertising or
   third-party cookies and analytics is first-party and opt-out, which may keep this simple.

Useful facts to hand over, all verifiable in this repository:

- Data collected, field by field: `docs/../migrations/` and the list on `/privacy`.
- Sub-processors: Cloudflare, OpenAI, Stripe. There is no analytics vendor, no map tile
  provider, no email provider, and no advertising.
- Retention: analytics rows for at most 90 days, enforced in code; everything else until the
  user deletes it.
- Rights already implemented in product: export as JSON and as an archive with photos,
  rectification through fact editing, erasure through account deletion, and an analytics
  opt-out that also honours Global Privacy Control and Do Not Track.

A cheaper middle path, if a full review is out of budget: pay for a single consultation on the
privacy notice only, since that is where the regulatory exposure sits, and keep the terms as
they are until there is revenue worth protecting.

## 11. Evidence To Record In progress.md

Paste and fill:

```text
Deployment URL:
Commit hash:
D1 database name and id:
R2 bucket name:
Migrations applied:
Secrets configured (names only):
Smoke test result (which of the 27 checks passed):
Stripe test-mode result:
Legal review status:
Known issues:
```

## 12. Do Not Do These

- Do not run `npm run build` or `npm run cf:build` while `npm run dev` is running.
- Do not remove `workers_dev: true` or the `routes` entry from `wrangler.jsonc`. Declaring a route
  makes Wrangler disable workers.dev unless it is set explicitly, and removing either one can take
  the apex or its fallback offline on the next deploy.
- Do not put live Stripe keys in `.dev.vars`.
- Do not remove the unreviewed-text notice from `/privacy` or `/terms` before a real review.
- Do not deploy with `npm run test:all` failing.
