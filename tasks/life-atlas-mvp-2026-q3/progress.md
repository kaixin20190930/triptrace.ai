# Life Atlas MVP Progress

Last updated: 2026-09-02 Asia/Shanghai

Source of truth:

> This file is the canonical current-status record for the active rebuild.
> `plan.md` defines target milestones, `schedule-2026-07-29-to-08-15.md` defines intended sequencing, and `audit-2026-07-28.md` is historical reference only.
> When implementation status changes, update this file first.

Plan: `tasks/life-atlas-mvp-2026-q3/plan.md`

Roadmap: `docs/overseas-life-atlas-commercial-roadmap.md`

Next implementation plan: `tasks/life-atlas-mvp-2026-q3/next-implementation-plan.md`

## Current Milestone

`Personal Activation MVP: Create, Confirm, Save, Revisit`

## Current Status

- The owner approved a clean product cut. There are no production users or legacy workflows to preserve.
- `/Users/liukai/Documents/triptrace.ai` is the only active implementation repository.
- `/Users/liukai/web/triptrace.ai` is legacy reference only and must not receive product changes.
- The active stack is Next.js, React, Cloudflare Workers/Pages, D1, R2, and the OpenAI Responses API.
- English-first AI Life Atlas positioning, metadata, homepage, application shell, account entry, Vault, Timeline, Map, and trace detail foundations are implemented in the active repository.
- Historical Atlas is retained as a public acquisition surface; community-feed growth is excluded.
- Personal trace creation supports text-only, photo-only, and combined input; image validation, preview, client compression, JPEG EXIF time/GPS extraction, bounded AI vision inputs, and signed-in R2 upload are implemented.
- OpenAI-backed AI memory generation is integrated behind the generation route with local/mock fallback behavior retained for resilience.
- Generation provenance is now explicit: real OpenAI drafts show provider/model and analyzed-photo count, while missing or failed OpenAI calls are labeled as local fallback without a misleading model name.
- Trace facts and AI narrative are separated in schema, API, detail UI, and save/update behavior.
- New saved traces are private by default and require explicit fact confirmation before permanent save.
- One anonymous capture draft is preserved locally through refresh and sign-up-to-save.
- Personal browsing surfaces exist: `/vault`, `/timeline`, and `/map` can open the same trace detail and restore selected traces from `?trace=` URLs.
- Trace detail now shows media, editable AI story/title/tags, confirmed facts, factual note, AI provenance, copy/download actions, and editable confirmed facts.
- Owner-only private media access and owner-only trace deletion are implemented; deletion attempts best-effort R2 media cleanup.
- Server-side entitlements are implemented and verified: Guest, Free, and Founding Plus limits are resolved and enforced in D1 on every write route, direct API calls cannot bypass them, concurrent requests cannot overspend an allowance, and a failed AI call does not consume a generation.
- An automated API test script covers privacy, ownership, deletion, and every entitlement rule; it creates and removes its own throwaway accounts.
- The rebuilt repository has not been deployed to production yet.

## Next Tasks

Owner-only steps, which cannot be completed by an agent:

1. `PA-205/PA-206 follow-up` Narrative-quality acceptance with genuine personal travel and life photos, plus section 2.1 clustering QA with a real photo library. Only the owner can supply these; unrelated private images on this machine must not be substituted.
2. `M2-010/PA-601/PA-602 follow-up` Observe `first_atlas_saved` once in a signed-in browser. The server flag and the client trigger are both verified in code and by API test; the remaining step is a real browser save.
3. Section 10 of `docs/manual-testing-guide.md` in a real browser, especially the guest-demo refusal and the Free-plan limit copy.
4. Section 9.2 of `docs/manual-testing-guide.md` in a real browser. The map geometry is covered by automated tests, but pan, pinch zoom, focus rings, theme legibility, and the absence of third-party requests need human eyes on a real device.

Owner-executed infrastructure, which an agent must not do unprompted:

5. `RB-301` Provision fresh production D1/R2 resources following `docs/production-provisioning-runbook.md`. The current `wrangler.jsonc` still points at the legacy production database and bucket, so no remote migration or deploy may run until the bindings are repointed.
6. Create the Stripe account, the `$9.99` monthly and `$79` annual prices, and the webhook endpoint, then run the test-mode checkout in section 11.3 of the manual testing guide. Every code path is implemented and locally verified; only the account and keys are missing.

Remaining engineering work:

7. `PA-701 to PA-705` Historical Atlas prototype, after the personal loop is deployed and measurable. Note the plan's own constraint: every historical fact must be human-verified, so an agent can build the structure, data model, map and timeline synchronisation, and SEO markup, but the owner must verify the content.
9. Confirm the CI workflow on a real runner. It is committed and its commands are all verified locally, but this repository has no Git remote yet, so no run has been observed.

## Completion Snapshot

| Area | Status | Notes |
|---|---|---|
| Product scope and roadmap | DONE | English-first personal Life Atlas, historical acquisition, digital-only, Web-only scope recorded |
| Active repository cutover | DONE | `/Users/liukai/Documents/triptrace.ai` is the only implementation target |
| English product shell | DONE | Homepage, metadata, navigation, account entry, and core routes exist |
| Text/photo capture | IN_PROGRESS | Imports up to 200 photos and groups them into candidate traces by date and place; multi-batch append, duplicate skipping, removable previews, compression, JPEG EXIF time/GPS extraction, and bounded vision inputs work; HEIC/advanced EXIF and queue persistence remain |
| AI generation | IN_PROGRESS | Real OpenAI vision generation, owner two-photo analysis, and browser text-generation QA pass; genuine personal-life narrative quality and failure-path QA remain |
| Fact confirmation | IN_PROGRESS | Required before create and fact PATCH; date, coordinates, place, people, and factual note are editable |
| Anonymous draft preservation | IN_PROGRESS | IndexedDB draft restore and sign-up-to-save path exist; needs broader manual QA |
| Private save and R2 media | IN_PROGRESS | Default private save, signed-in upload, owner-only media reads, and deletion cleanup exist; needs automated API coverage |
| Vault | IN_PROGRESS | Search, filters, photo shelf, cards, detail open, and a resurfacing rail exist; year/person filters are incomplete |
| Timeline | IN_PROGRESS | Event-date grouping, detail open, selected preview, and `?trace=` deep-link selection exist |
| Map | DONE (pending browser QA) | Real 2D coordinate map with pan, zoom, marker grouping, chronological connector, keyboard access, and `?trace=` sync, rendered from a first-party outline with no third-party requests; place route retained for unlocated traces |
| Trace detail | IN_PROGRESS | Facts/story separation, fact editor, narrative editor, copy, and poster download exist |
| Historical Atlas | NOT_STARTED | `/explore` is a placeholder/acquisition surface only |
| Analytics | IN_PROGRESS | Browser events through generation and fact confirmation are verified in local D1; the 90-day retention sweep is implemented and verified; signed-in first-save and production evidence remain |
| Sharing, export, deletion | DONE (pending browser QA) | Per-trace share links with hashed tokens, an allowlisted payload, blurred coordinates, and immediate revocation; complete JSON export and ZIP archive with photos; per-trace poster; trace deletion with a durable media retry queue; full account deletion with password re-entry. All verified by automated checks |
| Entitlements and server limits | DONE | Plan resolution, usage metering, and server enforcement on generate/media/memories are implemented and verified by 37 automated API checks |
| Automated tests | DONE (CI unobserved) | 172 checks total: 83 unit with no server, 55 API/privacy/entitlement, 34 billing. `npm run test:all` runs everything and manages its own server. A CI workflow is committed but has never run, because the repository has no remote |
| Billing | DONE (pending Stripe account) | Checkout, customer portal, signed idempotent webhook, `/plan` page, and billing analytics are implemented and verified with locally signed payloads; real Stripe keys, prices, and a test-mode end-to-end run remain |
| Production deployment | NOT_STARTED | No deployment evidence from rebuilt repository |

## Progress Log

### 2026-07-28

- Confirmed AI Life Atlas as the public product category and Life OS as the long-term vision.
- Confirmed personal Life Atlas as the primary product and historical Atlas as acquisition and demonstration.
- Confirmed the initial audience: English-speaking adults aged 25-45 with scattered travel and life photos.
- Confirmed text, photos, or both; 1-20 images; one complete anonymous experience; sign-up to save.
- Confirmed factual fields must remain user-controlled and separate from AI narrative.
- Confirmed private-by-default storage and selected sharing only.
- Confirmed digital-only, Web-only MVP; no community growth loop, native app, or formal 3D.
- Confirmed Founding Plus pricing target of `$9.99/month` or `$79/year`; future Pro target remains `$19/month`.
- Confirmed monthly cost alert at `$50` and hard ceiling at `$100`.
- Moved the active Next.js repository and all planning documents to `/Users/liukai/Documents/triptrace.ai`.
- Approved a clean rebuild instead of hardening the old production implementation.
- Added the canonical manual testing guide and repository operating rules.
- Reworked the product identity and homepage metadata around the English AI Life Atlas.
- Added real `My Atlas`, `Timeline`, `Map`, and `Historical Atlas` routes.
- Removed the duplicate top-bar account action; the sidebar account control is the single desktop account entry.

### 2026-07-29

- Added repository operating rules that make this rebuilt repository the only active product implementation.
- Removed App Router edge runtime declarations from API routes and verified Next/OpenNext builds against the current Next.js version.
- Added trace fact migration for event date, date precision, factual summary, people, coordinates, fact confirmation, and AI provenance.
- Enforced private-by-default memory creation and fact confirmation in `/api/memories`.
- Added PATCH support for confirmed fact updates on owner memories.
- Implemented text/photo capture improvements: 1-20 image selection, validation, preview, compression, bounded AI vision payloads, and signed-in media upload path.
- Added local IndexedDB capture draft persistence so an anonymous draft can survive refresh and sign-up-to-save.
- Added `/vault`, `/timeline`, `/map`, and `/explore` route foundations.
- Improved Vault into a private memory library with photo shelf, search, filters, cards, selected preview, and detail open.
- Improved Timeline with month grouping, selected preview, and detail open.
- Improved Map into a place-route browsing surface with selected-place summary and detail open.
- Rebuilt trace detail into a Life Atlas detail surface with media, AI story, confirmed facts, factual note, AI provenance, copy, poster download, and fact editing.
- Added trace detail narrative editing for title, story, and tags without changing confirmed facts.
- Added local JPEG EXIF extraction for capture date and GPS coordinates, with editable photo fact fields before generation and save.
- Persisted trace selection through `?trace=` URLs across Vault, Timeline, and Map.
- Added coordinate display to Map place summaries and trace cards when confirmed latitude/longitude are available.
- Hardened media reads so private R2 objects require the owner session unless attached to a public trace.
- Added owner-only trace deletion with best-effort R2 media cleanup and a detail-page delete action.
- Added the next implementation plan covering analytics, entitlements, production resources, real map, API/privacy tests, Stripe, and historical prototype sequencing.
- Added first-party activation analytics: D1 event migration, allowlisted and rate-limited write API, persistent anonymous/session identifiers, privacy-signal opt-out, and capture/auth/save/browse/edit/delete instrumentation.
- Documented a 90-day raw analytics retention rule and added complete manual analytics verification steps.
- Verified migrations `0001` through `0008` against an isolated fresh local D1 database.
- Verified `/api/analytics` locally: valid events return `202`, unsupported events return `400`, payloads over 8 KB return `413`, signed-out events keep `user_id` null, signed-in events attach the user ID, and non-allowlisted private properties are discarded.
- Diagnosed and recovered a local Fast Refresh reload loop caused by running production builds while `next dev` was using the same `.next` directory; documented the build/dev isolation rule.
- Owner completed manual analytics QA through startup, homepage/create, and photo/EXIF checks; testing from AI generation onward remains.
- Added per-photo draft removal controls, EXIF candidate recalculation, generated-draft media synchronization, and owner-only cleanup for uploaded media that is not attached to a saved trace.
- Verified draft-media deletion authorization locally: signed-out requests return `401`, cross-owner keys return `403`, and owner unreferenced cleanup returns `200`.
- Updated `docs/manual-testing-guide.md` for each user-facing behavior added during the rebuild.
- Verified the current rebuild with `npm run lint`, `./node_modules/.bin/tsc --noEmit`, `npm run build`, `npm run cf:build`, and `git diff --check`.

### 2026-07-30

- Fixed photo selection so later upload batches append to the existing selection instead of replacing it.
- Disabled the upload control only when 20 photos are selected or while generation/save is in progress.
- Clarified that `Generate AI Trace` is disabled only when both text and photo inputs are empty, or while generation is already running.
- Added duplicate-file skipping while allowing a removed file to be selected again.
- Rewrote the capture QA steps to name the exact button and state expected in every limit/removal case.
- Owner manually verified multi-batch append, photo removal, same-file reselection, the 20-photo limit, and the corrected upload/generate button states.
- Diagnosed the generic draft as a local fallback caused by `OPENAI_API_KEY` being absent from the active local environment, not an OpenAI response.
- Removed the misleading model label from fallback responses and added explicit OpenAI/fallback provenance messaging.
- Added adaptive multi-photo draft layouts and multi-photo poster collages using up to four representative images.
- Reframed capture as a four-step create, AI draft, fact confirmation, and private-save flow; renamed the primary action to `Draft my story with AI`.
- Reconciled the drifted local D1 migration ledger and applied the missing trace-fact columns that caused `POST /api/memories` to return `500`.
- Verified a clean local sign-up, private trace create (`201`), and owner-list round trip after the schema repair.
- Owner configured the active rebuild's OpenAI key and verified `provider: OpenAI`, `configured: true`.
- Owner verified real two-photo vision generation: both images rendered, both were analyzed, model provenance displayed, and the output accurately distinguished the product-label variants without inventing a personal event.
- Re-ran the activation backend end to end with real OpenAI output: temporary QA sign-up, R2 upload, private save (`201`), owner list, owner media read (`200`), signed-out media denial (`403`), trace deletion, and post-delete media denial (`404`) all passed; QA data was removed.
- Added `127.0.0.1` to Next.js `allowedDevOrigins` after browser QA exposed blocked development HMR requests that prevented React controls from hydrating correctly outside `localhost`.
- Fixed the signed-out save state so a locally retained pending draft says `Sign in to save`; only a successful authenticated cloud save may display `Saved`.
- Browser QA verified text generation, editable OpenAI output, disabled-before-confirm save, confirmation enabling save, edits clearing confirmation, draft retention through reload, and the signed-out account-dialog handoff.
- Local D1 evidence confirmed `personal_demo_start`, `personal_text_entered`, generation start/success, and fact-confirmation events; signed-in browser `first_atlas_saved` remains unverified.

### 2026-09-01

Handover code audit against this file. No product code was changed during the audit step.

Repository and workspace state:

- `pwd` confirmed `/Users/liukai/Documents/triptrace.ai`; `/Users/liukai/web/triptrace.ai` was not touched.
- `git log` still shows only `ff9aea8`, `41d93f5`, `eefc14b`; the rebuild remains an uncommitted working tree of 25 modified and 18 untracked paths. Nothing was reset, checked out, committed, or pushed.
- Documentation dates in this file trailed reality: the last recorded entry was `2026-07-30`, while the newest source and doc files were written `2026-08-23`. Today is `2026-09-01`.

Non-destructive checks re-run on the current tree:

- `npm run lint` passed with no findings.
- `./node_modules/.bin/tsc --noEmit` passed with no findings.
- `git diff --check` passed with no whitespace errors.
- No `next dev` server was listening, so no `.next` conflict existed; `build` and `cf:build` were intentionally not run in this step.

Local D1 state verified directly against the miniflare SQLite file:

- The `d1_migrations` ledger lists `0001` through `0008`, matching the files on disk.
- `users` = 5, `memories` = 2, `analytics_events` = 79.
- The two stored memories are June-era local dev rows with Chinese titles, null `facts_confirmed_at`, and null `ai_source`. They predate the fact-confirmation contract and are local-only development residue, not product data.
- `analytics_events` contains `personal_demo_start`, `personal_text_entered`, `personal_photo_import`, `personal_photo_removed`, `personal_photo_validation_failed`, `personal_exif_detected`, generation start/success/failure, `personal_fact_confirmed`, `signup_started`, `signup_completed`, `vault_opened`, and `timeline_opened`.
- `first_atlas_saved` and `map_opened` have zero rows, which independently confirms that signed-in first-save analytics has never been exercised end to end.

Code-versus-document reconciliation:

- Every capability this file lists as implemented was located in code. Nothing documented as done was found missing.
- `first_atlas_saved` correctness was verified by reading the code rather than by trusting the checklist: `POST /api/memories` computes `isFirstTrace` from `SELECT COUNT(*) FROM memories WHERE user_id = ?` before the insert, and `capture-panel.tsx` only fires the event when the response returns `isFirstTrace`. The once-per-account property therefore holds by construction; only the browser observation is outstanding.
- Audit correction: this file previously described the AI-generation route as if it were only missing plan limits. It was in fact completely unguarded. `POST /api/generate-memory` required no session, applied no rate limit, and counted no usage, so any anonymous caller could drive unlimited OpenAI spend against the `$50` alert and `$100` ceiling. This was reclassified as the highest-priority gap ahead of any narrative-quality polish.
- `POST /api/memories` silently truncated `photoKeys` to 20 and `POST /api/media` silently truncated uploads to 20 files instead of returning a stable error, so a client could exceed the intended per-trace image rule without being told.
- No `subscriptions` table, no `usage_counters` table, and no `src/lib/server/entitlements.ts` existed, confirming `PA-401` to `PA-404` as genuinely not started.

Conclusion: the documented status was accurate but incomplete about server-side exposure. Phase 3 entitlement work was started immediately rather than after the remaining photo-quality QA, because unmetered AI spend is a cost-and-abuse risk while narrative quality is only a polish gap.

Entitlements and server-side limits implemented (`PA-401` to `PA-404`):

- Added `migrations/0009_entitlements.sql` with `subscriptions` and `usage_counters`. `usage_counters.user_id` holds either a user id or a `guest:<hash>` subject, and `period_key` is a UTC `YYYY-MM` month for monthly allowances or `lifetime` for one-time ones.
- Added `src/lib/plans.ts` as the single shared definition of Guest, Free, and Founding Plus limits, the stable entitlement error codes, and the English refusal copy.
- Added `src/lib/server/entitlements.ts` for plan resolution, atomic quota reservation, refunds, and uniform refusal bodies.
- Plan resolution degrades a lapsed, cancelled, or unrecognised subscription to Free rather than to no access, so a former subscriber never loses read, export, or delete rights over their own Atlas.
- `POST /api/generate-memory` now resolves entitlements, throttles by IP, refuses over-cap photo counts, and reserves one generation before the provider call.
- `POST /api/memories` enforces the stored-trace limit inside the insert statement, and refuses over-cap `photoKeys` instead of silently truncating to 20.
- `PATCH /api/memories` applies the same photo cap.
- `POST /api/media` refuses an over-cap batch instead of dropping the surplus files.
- Added `GET /api/entitlements` as the minimal plan and usage read model. It is a convenience surface only; every write route re-resolves entitlements itself.
- Added `src/lib/guest-id.ts`. The guest metering identifier is deliberately separate from the analytics anonymous id, because analytics can be switched off by the visitor while quota metering must keep working. The server hashes the value and falls back to a request-IP subject when it is absent.

Two design decisions worth recording:

- Quota is claimed before the provider call and refunded when the call does not produce a usable draft. Counting only after success would let simultaneous requests both see the same free slot; counting without a refund would charge users for our failures.
- Every allowance check is a single conditional SQL statement (`UPDATE ... WHERE count < limit`, and `INSERT ... WHERE (SELECT COUNT(*) ...) < limit`). This is what makes concurrent requests safe without a transaction.

Client behaviour:

- `src/lib/generate.ts` now throws a typed `GenerationRequestError` carrying the server code. A non-retryable `4xx` refusal is no longer retried as a transport failure, so the plan message reaches the user instead of a generic "Generation failed".
- The capture panel keeps the draft text, photos, and photo facts on screen for every refusal, records `paywall_viewed` with the entitlement code, and surfaces the server message for generation, upload, and save refusals.

Verification:

- `npm run lint`, `./node_modules/.bin/tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` all pass. `cf:build` reports only a pre-existing duplicate-object-key warning from a bundled dependency.
- Applied `0009_entitlements.sql` to local D1; the ledger now lists `0001` through `0009`.
- Added `scripts/api-entitlement-tests.mjs` and ran it against local dev: 37 of 37 checks pass, including guest refusals, cross-user privacy, non-owner delete and patch, the media cap at and above the limit, orphan media cleanup, the free trace limit, `isFirstTrace` firing exactly once, five parallel over-limit saves all refused, and fact confirmation still required.
- Verified metered AI behaviour against the real provider: a fresh guest device received one `openai` draft, the second attempt returned `403 entitlement_guest_demo_used`, and a provider rejection returned an explicit local fallback and restored the allowance to zero in `usage_counters`.
- Verified concurrency with a real spend: with one generation left in the month, three parallel requests produced exactly one `200` and two `403 entitlement_generation_limit_reached`.
- Verified plan transitions by writing `subscriptions` rows directly: an active `founding_plus` row reported 500 traces and 50 monthly generations, an expired period degraded to Free, and a `canceled` status degraded to Free.
- Total real provider spend for this verification was three successful text-only generations plus two rejected requests.
- All QA accounts, traces, media objects, usage rows, and subscription rows created during this session were removed. Local D1 is back to the five pre-existing accounts and two pre-existing memories, `usage_counters` and `subscriptions` are empty, and no QA object remains in local R2. Added `npm run qa:cleanup` so this is repeatable.

Ninety-day analytics retention implemented (`PA-901`):

- Added `src/lib/server/analytics-retention.ts` as the single definition of the 90-day cutoff and a bounded 500-row delete batch. The subselect delete form is used because `DELETE ... LIMIT` is not available on every SQLite build, and an unbounded delete has no business running inside a request.
- Added `POST` and `GET /api/admin/analytics/cleanup`. `GET` is a dry run reporting the cutoff and expired count; `POST` sweeps up to 20 batches per call. Neither response contains event contents.
- The endpoint is closed by default: with no `ADMIN_TASK_TOKEN` configured it returns `503 admin_token_missing` rather than falling back to open access. A wrong or missing token returns `403 admin_forbidden`.
- `POST /api/analytics` also sweeps opportunistically on roughly one percent of writes, behind `ctx.waitUntil`, so the retention promise does not depend on a schedule being wired up correctly. It can never delay or fail an event write.
- Added `ADMIN_TASK_TOKEN` to `.dev.vars.example`.

Retention verification:

- With no token configured, both methods returned `503`. After configuring a local token, a missing header and a wrong header both returned `403`.
- A dry run reported `retentionDays: 90` and a cutoff 90 days back. Three seeded rows dated January, February, and May 2026 were reported as expired; a row dated 2026-08-25 was not.
- The sweep deleted exactly the three expired rows, kept the in-window row, and left the oldest real event at 2026-07-29. A second sweep deleted `0`, so repeating it is safe.
- No pre-existing analytics row was older than the cutoff, so no real event data was lost. The seeded rows were removed afterwards and the table is back to its original 79 rows.
- The automated suite now covers the retention endpoint and reports 39 of 39 checks passing.
- `npm run lint`, `tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` pass with the new route registered as `ƒ /api/admin/analytics/cleanup`.

Local environment change worth knowing: an `ADMIN_TASK_TOKEN` line was appended to the gitignored `.dev.vars` so the endpoint could be tested locally. Its value is a throwaway placeholder and is deliberately not recorded here. Replace it with a real random value before any deployment, and never reuse the local one.

Real coordinate map implemented (`PA-301`, `PA-302`, `PA-303`):

- Added `src/lib/atlas-projection.ts` holding the equirectangular projection, view clamping, fit-to-points, zoom anchoring, marker grouping, and the chronological connector. It is deliberately separate from React so the geometry can be tested directly rather than judged from a screenshot.
- Added `src/components/map/atlas-map.tsx`: an SVG map with drag to pan, wheel and pinch zoom, zoom/fit controls, keyboard-activatable markers, marker grouping with a count for traces at the same spot, and a dashed chronological connector.
- Added `public/world-land.json`, a 26 KB (11 KB gzipped) Natural Earth 1:110m land outline reduced to 104 rings and 2080 points, plus `scripts/build-world-land.mjs` to regenerate it. The asset is committed so builds stay offline.
- Wired into `/map` beside the existing place route. Only user-confirmed coordinates are plotted; nothing is geocoded from a place name and nothing is inferred from story text. Unlocated traces stay reachable in the place route and the list, with a count explaining how many lack coordinates.

The map deviates from the plan's MapLibre plus OpenFreeMap recommendation, on privacy grounds. Requesting tiles from a third party would tell that provider which part of the world the user is looking at on every pan and zoom. For a product whose core promise is that memories stay private, that is a poor trade for a nicer basemap. Browsing the Atlas map now makes no third-party request of any kind. If richer cartography is wanted later, swapping in a tile provider is a contained change, but it should be an explicit and disclosed decision rather than a default.

Activation metric correction found while testing the map:

- `isFirstTrace` was derived from the current stored-trace count, so a user who deleted every trace and saved again would fire `first_atlas_saved` a second time and inflate activation.
- It is now derived from a lifetime `trace_saves_total` counter incremented atomically after each successful save, using `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`. Exactly one save per account can ever observe the value `1`.
- Covered by two automated checks: the first save of an account is flagged and the second is not, and emptying the Atlas then saving again is not re-flagged.

Map and production-prep verification:

- Added `npm run test:map`, a dependency-free Node test using built-in type stripping: 32 of 32 checks pass, covering pole and antimeridian projection, a known city coordinate, view clamping and aspect ratio, single-point and widely-spread fitting, zoom bounds and anchor stability, marker grouping, connector ordering, and the outline asset's format, ranges, and size.
- The automated API suite now also asserts that `/world-land.json` is served from our own origin, that confirmed coordinates round-trip unchanged, and that a trace without coordinates stays listed with null coordinates. It reports 44 of 44 checks passing.
- `npm run lint`, `./node_modules/.bin/tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` pass. `tsconfig.json` gained `allowImportingTsExtensions` so the Node-run test file stays type-checked; the project is `noEmit`, so this is safe.
- Added `docs/production-provisioning-runbook.md` with the exact commands, secret list, migration steps, a 20-item smoke-test table, and an evidence template. Nothing in it was executed.

Production risk recorded rather than acted on:

- `wrangler.jsonc` still binds `DB` to the legacy production database `triptrace` and `MEDIA` to the legacy bucket `triptrace-media`. Local development is unaffected because Wrangler keeps a separate local database, but any `--remote` migration or any deploy would reach legacy production data, which the clean-cut decision explicitly rules out. The bindings must be repointed to fresh resources before either is run. This is flagged, not changed, because creating cloud resources is the owner's call.

Stripe billing implemented (`PA-405` to `PA-410`, `PA-603`):

- Added `migrations/0010_stripe_events.sql` with a `stripe_events` idempotency ledger and an index on `subscriptions.provider_customer_id`, which webhooks use to resolve an account.
- Added `src/lib/server/stripe.ts` for signature verification, the checkout payload, price-to-plan mapping, event mapping, and subscription persistence. Environment access is separated into `stripe-config.ts` so the logic module stays free of Cloudflare runtime imports and can be unit tested directly.
- Added `POST /api/billing/checkout`, `POST /api/billing/portal`, and `POST /api/billing/webhook`.
- Added `/plan`, a private `noindex` page showing the current plan, real usage against limits, upgrade buttons at `$9.99` monthly and `$79` annually, and a manage-billing button once a Stripe customer exists. Linked from the sidebar account menu.
- Added `src/lib/server/analytics.ts` and `GET /api/admin/analytics/summary` so the billing funnel is measurable. `subscription_started` and `subscription_cancelled` are recorded server-side on real plan transitions only.

The architecture keeps payment out of the access-control path. Stripe writes only to `subscriptions`; entitlements are re-derived from that table on every request. A missing, delayed, or dropped webhook can therefore only under-grant, never over-grant.

Five specific safeguards, each covered by a test:

- An unverifiable webhook is refused. With no `STRIPE_WEBHOOK_SECRET` the endpoint returns `503` rather than trusting the payload, and the timestamp is checked before the digest so a captured request cannot be replayed indefinitely.
- Event ids are claimed in a ledger, so a replayed delivery is acknowledged without being applied twice. When a handler throws, the claim is released so Stripe's retry can still be processed; keeping it would turn a transient failure into permanent data loss.
- An unrecognised price maps to `free`, never to a paid plan, so a misconfigured price cannot silently grant Founding Plus.
- A `userId` in event metadata is verified against the users table before use, so a forged id cannot attach a plan to an arbitrary account.
- Stripe does not guarantee event ordering, so `checkout.session.completed` only links the customer and never writes plan state. A late checkout delivery cannot downgrade an already-active subscription.

Two defects found and fixed during this work:

- The checkout route checked Stripe configuration before validating the request body, so a bad `interval` returned `503 billing_not_configured` instead of `400 invalid_interval`. Input validation now comes first.
- The first draft of the webhook wrote `plan_key` and `status` on checkout events, which meant a late `checkout.session.completed` would downgrade an active subscriber to `free`/`incomplete`. Customer linking is now a separate statement that leaves plan state alone.

Verification:

- Added `scripts/stripe-unit-tests.mts`: 39 of 39 checks pass with no network and no Stripe account, covering configuration resolution, price-to-plan mapping in both directions, the checkout payload for new and returning customers, signature generation and verification including rotation, tampering, truncation, and clock skew, and event mapping for created, updated, deleted, cancelling, unknown-price, checkout, and unhandled events.
- Added `scripts/api-billing-tests.mjs`: 34 of 34 checks pass against local dev. Because Stripe's scheme is an HMAC over `<timestamp>.<payload>`, the script signs its own deliveries and exercises the real endpoint: unsigned, malformed, wrong-secret, stale, and tampered payloads are all rejected with distinct codes; a signed event grants Founding Plus through the entitlement layer; a replay is reported as a duplicate; a late checkout does not downgrade; an unrecognised price does not grant; cancel-at-period-end retains access; deletion returns the account to Free while read access is preserved; an expired period does not grant; unknown and forged accounts are not applied; and the billing funnel records one event per real transition rather than one per Stripe update.
- Added a resolution hook (`scripts/ts-resolve-hooks.mjs`) so the unit runners understand the `@/` alias and extensionless imports. This is test-harness only and no application code depends on it.
- `npm run test:unit` now runs both unit suites: 71 checks. `npm run test:api` remains 44 checks and was re-run to confirm no regression.
- `npm run lint`, `./node_modules/.bin/tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` all pass. The five new routes and `/plan` are registered.
- All QA accounts, subscriptions, usage counters, and webhook ledger rows created during testing were removed. `scripts/qa-cleanup.sql` was generalised to match any `qa-*@example.invalid` account, and local D1 is back to five pre-existing accounts, two memories, and 79 analytics rows.

Local environment note: placeholder `STRIPE_WEBHOOK_SECRET` and price ids were appended to the gitignored `.dev.vars` for testing. `STRIPE_SECRET_KEY` was deliberately left unset, which also exercised the not-configured checkout path. No real Stripe key exists in this repository or on this machine.

Test orchestration and CI added:

- Added `scripts/run-e2e-tests.mjs`. It applies local D1 migrations, finds a free port, starts its own `next dev`, waits for readiness, runs the API and billing suites, removes the test data, and always shuts the server down, including on interrupt.
- An existing `.dev.vars` is read but never modified or overwritten. When the file is absent the runner creates a temporary one from local placeholders and deletes it on exit. If the file exists but lacks a required value, the runner refuses to guess and says which value is missing.
- Added `npm run test:e2e` and `npm run test:all`. The latter is the single command for lint, types, unit suites, and both HTTP suites.
- Added `.github/workflows/ci.yml` running the same commands, plus a guard step that fails the build if `.dev.vars`, `.next`, `.open-next`, `.wrangler`, or any `.sqlite` file is ever tracked. No secrets are needed, because the suites generate their own local state and sign their own webhook payloads.
- `git diff --check` was deliberately left out of CI. On a clean checkout it compares the working tree to the index and can never fail, so it stays a local gate rather than a step that always passes.
- Node 22.6 or newer is required in CI because the unit suites run TypeScript through Node's built-in type stripping instead of a build step.

Orchestration verification:

- `npm run test:e2e` with the existing `.dev.vars` present: 44 of 44 API checks and 34 of 34 billing checks passed, and the server was shut down afterwards.
- Repeated with `.dev.vars` moved aside to reproduce a clean CI checkout: the runner created a temporary file, both suites passed identically, the temporary file was deleted, and no process was left listening on the port. The real `.dev.vars` was byte-for-byte identical after being restored.
- The CI secret-guard logic was checked against the current index: none of the protected paths are tracked, and no `.sqlite` file is tracked among the 134 tracked files.
- `npm run lint`, `./node_modules/.bin/tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` all pass.

Honest limitation: the workflow file itself has never executed. Every command inside it is verified locally, but runner-specific behaviour, such as whether `cf:build` completes inside the time limit on a GitHub runner, is unproven until a remote exists and a run happens.

Media deletion made durable (`PA-108`):

Reading the delete path showed this was more than an observability gap. A failed R2 delete was reported once in the response and then forgotten, with nothing tracking the key. The database row was already gone, so the photo was unreachable through the API, but the object stayed in the bucket indefinitely: a cost leak and a weaker guarantee than "deleting a trace deletes its photos".

- Added `migrations/0011_media_cleanup_queue.sql` with attempt counts, last error, a next-attempt time, and an `abandoned_at` marker so a stuck key stays visible instead of retrying forever.
- Added `src/lib/server/media-cleanup.ts`: enqueue, bounded sweep, exponential backoff, and aggregate stats.
- Trace deletion now enqueues failed keys, and also drains up to five of the caller's own pending keys on each delete, so a recovered bucket heals through normal use without a scheduler. That drain can never fail the deletion the user asked for.
- The sweep refuses to delete a key that a surviving trace still references, dropping it from the queue instead. A live memory must never lose its photo to a stale queue entry.
- Added `GET` and `POST /api/admin/media/cleanup`, token-gated through the shared fail-shut admin gate. The report returns counts and timestamps only: a media key identifies a specific private photo and has no place in an operational report.

A defect found by its own test: the one-day backoff ceiling was unreachable. The exponent was clamped at 10, which caps the delay at 17 hours, so `Math.min(base, oneDay)` could never return the ceiling. With the old 8-attempt limit the total retry window was also only about four hours, which would abandon keys during a single long storage incident. The exponent clamp was raised above the attempt limit and the limit raised to 12, giving a verified 58-hour window with the ceiling actually reached at the final attempt.

Verification:

- Added `scripts/media-cleanup-unit-tests.mts`: 12 of 12 checks on the retry schedule, including the ceiling being reachable rather than dead code, monotonicity, negative and fractional attempt counts, and the total retry window.
- The API suite now exercises the full cycle against real local R2: upload an object, confirm the owner can read it, seed a pending queue row standing in for a past failure, confirm it is reported as pending and due, sweep, confirm the object is deleted and the row cleared, confirm a second sweep is a no-op, and confirm the sweep refuses to delete a key that a surviving trace still references. 55 of 55 checks pass.
- Honest gap: the R2-failure branch itself is not triggered by a test, because an R2 delete failure cannot be provoked through the API. The queue is seeded instead, so everything downstream of the failure is covered while the failure detection itself is only covered by inspection.
- `npm run test:unit` is now 83 checks, `npm run test:api` 55, `npm run test:billing` 34. `lint`, `tsc --noEmit`, `git diff --check`, `build`, and `cf:build` pass.
- Local D1 and R2 are clean after the run: five pre-existing accounts, two memories, 79 analytics rows, and an empty cleanup queue.

Photo clustering implemented (`M2-004`):

Context for the reordering: an audit of the defined roadmap against the code showed that Phase 1 (historical SEO) and most of Phase 3 (retention) were skipped while Phase 4 (billing) was built early, and that `M2-004` was missing. Missing clustering meant a real trip of 300 photos could only be entered 20 at a time, so the product was unusable for exactly the person it targets. The owner also decided to keep the `triptrace.ai` domain and defer any brand change, and to treat the earlier "Atlas Book" idea as withdrawn: the roadmap's own `M3-007 digital export` is the real item, and it sits in Phase 3.

- Added `src/lib/photo-clustering.ts`. Photos are ordered by capture time and a new candidate starts on a gap over 6 hours or a move over 30 km, with the per-candidate size capped at 20 to match the entitlement layer's per-trace image limit.
- Two rules from the fact contract shaped the algorithm. Nothing is invented: a suggested date or coordinate is only ever copied from metadata that exists. Photos with no date are never merged into a dated group, because that would hand them a date they do not have; they form their own clearly labelled candidate.
- Suggested coordinates use the median rather than the mean, so one bad GPS fix cannot drag the suggestion across a city. The antimeridian limitation of taking latitude and longitude independently is documented in the module and accepted, since candidates are bounded to a small radius and the value is user-editable.
- A split caused only by the 20-photo limit is labelled differently from a real change of day or place, so the interface never claims something the data does not support.
- No geocoding. Place names remain the user's to supply, per the roadmap's data rules.
- Import limit raised to 200 photos while a trace still holds 20. An import that fits one trace keeps the existing direct path untouched, so the flow already proven in QA is unchanged; grouping appears only when it is needed.
- Review UI lists each candidate with its suggested date, photo count, split reason, and coordinates, and offers work-on-this-one, merge-with-next, and skip. Merge is hidden when it would exceed 20 photos.
- Loading a candidate prefills the date and coordinate fact fields from its suggestions, which remain editable and still clear the fact confirmation when edited.
- The review list shows how many AI drafts remain in the period, read from `/api/entitlements`, so a large import is not a dead end discovered at generation time.
- Added `personal_photos_clustered`, `personal_candidate_opened`, and `personal_candidates_merged` to the analytics allowlist, carrying counts and booleans only.

Verification:

- Added `scripts/photo-clustering-tests.mts`: 49 of 49 checks. Coverage includes haversine distance against two real city pairs, one-morning grouping, the time-gap and distance thresholds and their configurability, a photo without coordinates not masking a later change of place, size-limit chunking preserving every photo exactly once, undated separation, unparseable dates treated as absent, out-of-range coordinates ignored, median resistance to an outlier, merge and remove behaviour including refusal to merge past the limit, and a realistic 200-photo five-day two-city trip.
- One test failure during development was my test being wrong, not the code: when a change of city coincides with an overnight gap the gap is reported, because a long gap is the more informative explanation. The assertion was rewritten to check the property that matters, which is that two cities never share a candidate.
- `npm run test:unit` is now 132 checks across four suites. `npm run test:e2e` re-run at 55 API and 34 billing checks with no regression. `npm run lint`, `tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` pass.
- Pre-existing `Date.now()` calls in the capture panel began failing the React Compiler purity rule once this component grew, even though they only run inside event handlers. The clock read was moved to a documented module-level helper rather than suppressed.

Known limitation, stated in the interface rather than hidden: the review queue is held in memory, so a refresh clears it. A candidate already loaded into the working draft still persists, because that is the existing draft. Persisting a 200-photo queue needs a change to the IndexedDB draft store and was deliberately left out of this increment.

Not accepted yet: section 2.1 of the manual testing guide needs a browser run with real photo libraries, including HEIC and photos with no EXIF at all.

Data export and account deletion implemented (`M3-007`, `M3-008`):

Both are compliance requirements for the intended market, not optional features, and both were treated as rights rather than product surface.

- Added `src/lib/server/zip.ts`, a hand-written streaming ZIP writer. A dependency was avoided because the need is narrow: bundle a manifest and a set of already-compressed JPEGs. Every entry is stored uncompressed, since re-compressing JPEG data costs CPU for almost no size gain. Memory stays flat because each entry is buffered only long enough to compute its CRC32 and length.
- Added `src/lib/server/account-data.ts` to build the export payload and to perform deletion.
- Added `GET /api/export` returning complete JSON: account, plan, usage counters, every trace with confirmed facts kept separate from the AI narrative and its model provenance, the media inventory, and the account's own analytics rows.
- Added `GET /api/export/archive` returning a ZIP with `manifest.json` plus the photo files. This is the export that makes portability real, because the JSON alone references photos by URL, which is useless once the account is gone.
- Added `DELETE /api/account` for complete deletion.
- Added a `Your data` section to `/plan` with both exports and a guarded delete flow.

Four decisions worth recording:

- Export is available on every plan and never consults the entitlement layer. Charging someone to retrieve their own memories would contradict the promise that the content is theirs, and portability is expected under GDPR and CCPA. The earlier idea of gating a composed export behind payment was dropped for this reason.
- Deletion requires the current password, not just a session. A borrowed or stolen session must not be able to destroy someone's Atlas.
- Deletion is refused while a live paid subscription exists, with `409 account_has_active_subscription`, so nobody is ever billed for an account that no longer exists. Cancelling automatically through the Stripe API would be friendlier and is recorded as a follow-up; refusing is safer and fully testable today.
- Analytics rows for a deleted account are deleted rather than anonymised. Keeping a pseudonymous row after an erasure request is harder to defend than losing some funnel history, and the product is early enough that the history is cheap.
- Archive guards are CPU-driven, not memory-driven: streaming keeps memory flat, but checksumming a very large archive inside one request would not finish. Sizes are read from R2 metadata so an oversized archive is refused before any bytes are read, rather than failing halfway through a download.

Verification:

- Added `scripts/zip-unit-tests.mts`: 16 of 16 checks. CRC32 is checked against published known answers, and the archives are written to disk and verified with the system `unzip`, including an integrity test, entry listing, byte-identical text extraction, a binary entry covering all 256 byte values, nested paths, a skipped unreadable entry, and a 40-entry archive to confirm the central directory offsets stay correct.
- A real bug was found by these tests: the stream deadlocked when an entry was skipped, because `pull` returned without enqueuing and nothing else triggered another pull. It now loops until it either enqueues or finishes.
- Added `scripts/api-account-data-tests.mjs`: 34 of 34 checks. Export contents, downloadable headers, fact/narrative separation, model provenance, media paths matching real archive entries, absence of any password hash, cross-account isolation, and the archive passing a real integrity check. Deletion covers the missing-password and wrong-password refusals, the active-subscription guard, successful deletion, cookie clearing, inability to sign in afterwards, media no longer being served, and a direct database sweep confirming no row in `users`, `memories`, `sessions`, `subscriptions`, `usage_counters`, or `analytics_events` still references the account.
- `npm run test:unit` is now 148 checks across five suites. `npm run test:e2e` runs three HTTP suites totalling 124 checks, aggregates all three exit codes, and was confirmed to exit non-zero on failure and zero on success.
- A full run leaves local storage exactly as it found it: seven pre-existing R2 objects, five pre-existing accounts, two pre-existing memories, and an empty media cleanup queue.
- `npm run lint`, `tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` pass.
Two defects in my own tooling, found and fixed during this work:

- Stopping the dev server with `SIGTERM` could leave `.next/dev/types` truncated, which then failed `tsc --noEmit` with errors that appeared to come from application code. The runner now waits for the server to actually exit before removing that generated directory, and never lets a failure there fail an otherwise green run. The first attempt at this fix raced with the still-running server and turned a fully passing run into an `ENOTEMPTY` failure, which is why the wait was added.
- `scripts/qa-cleanup.sql` did not clear rate-limit buckets, so a second test run inside the same hour failed against limits the first run had consumed. The whole `rate_limits` table is now cleared, since it is ephemeral infrastructure state rather than user data. The account-deletion throttle was also raised from five to ten per hour, which still makes password guessing useless against PBKDF2 while leaving room for a mistyped password and for several people behind one shared address.

A weakness in my own assertions was also corrected. The account test originally proved only that media returned `404` after deletion, but that route resolves access through a referencing trace, so a `404` proves authorisation failed rather than that the object was removed. The test now asserts the reported `mediaDeleted` count, and a direct storage check confirmed a full run leaves exactly the pre-existing objects behind. The entitlement suite likewise now checks every uploaded key is removed rather than only the first, because a single silent failure there would orphan an object that nothing else would notice.

Known gap, recorded rather than glossed over: `M3-008` also names share links, which do not exist yet (`M3-005`). That half cannot be tested until sharing lands, and the manual guide says so.

Selected-trace sharing and revocation implemented (`M3-005`, `M3-006`):

Sharing is the only deliberate hole in a private-by-default product, so it was built and tested as a privacy feature rather than a growth feature. It also completes the share-link half of `M3-008`, which previously could not be tested.

- Added `migrations/0012_share_links.sql` and `src/lib/server/share-links.ts`.
- `POST /api/share` creates a link for one owned trace, `GET /api/share` lists links, `DELETE /api/share?linkId=` revokes.
- `GET /api/shared/[token]` returns the public payload and `/s/[token]` renders the human-facing page, both `noindex` and both `no-store`.
- `GET /api/shared/[token]/media/[index]` serves the photos.
- Added an owner-facing share panel to trace detail that states what a link exposes before one is created.

Six decisions, each with a reason:

- Tokens are stored as unsalted SHA-256 hashes. A dump of the table yields no working URLs, and the hash stays deterministic so lookup still works. The cost is that a URL cannot be shown twice, which is why the interface shows it once and says so plainly rather than pretending otherwise.
- The public payload is built field by field from an allowlist. Returning the stored trace would leak the owner's account id, their email through the joined user record, exact coordinates, and any field added to traces later. A unit test asserts the exact key set so the allowlist fails closed as the schema grows.
- Coordinates are rounded to about a kilometre. A recipient can see the neighbourhood a memory belongs to; sharing a memory must not mean sharing an address.
- Photos are addressed by position under the token rather than by storage key. This was a correction: the first implementation passed the token to the existing media route, and a test caught that the storage key embeds the owner's account id, so every shared photo URL leaked it. Indexing also leaves a recipient nothing to probe with, since they cannot name a key at all. Share support was then removed from the owner-only media route entirely, which leaves one less path that could be talked into serving someone else's media.
- Shared responses are `no-store` and shared photos are `private, max-age=60`. A long or shared cache would let a revoked link keep serving content from an intermediary, which would make revocation a lie.
- Unknown, revoked, expired, and out-of-range all answer identically, so the endpoints cannot be used to probe for valid tokens or ids. Revocation of a link belonging to another account is likewise indistinguishable from a missing one.

Verification:

- Added `scripts/share-links-unit-tests.mts`: 35 of 35 checks, covering token shape and uniqueness across 500 draws, rejection of empty, short, overlong, traversal, and non-string tokens, hash determinism, expiry boundary behaviour, revocation winning over a future expiry, and the payload shaping including the exact allowlist and the absence of the account id, storage keys, and exact coordinates anywhere in the serialised output.
- Added `scripts/api-sharing-tests.mjs`: 54 of 54 checks over HTTP, covering authentication, refusal to mint a link for another account's trace, one-time URL delivery, the public read and page, `noindex` headers, photo access by index, refusal of out-of-range and non-numeric indexes, the owner-only media route refusing to serve a shared photo even when handed a token, isolation between two tokens, invalid-token handling, view counting, cross-account revocation failure, immediate revocation of both story and photos, double revocation, auditability of a revoked link, expiry, link removal on trace deletion, link removal on account deletion, and share links appearing in the export by prefix only.
- `npm run test:unit` is now 183 checks across six suites. `npm run test:e2e` runs four HTTP suites totalling 178 checks.
- `npm run lint`, `tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` pass.

Memory resurfacing implemented (`M3-003`):

The acceptance criterion is that existing traces surface *without creating new content*, so this is pure selection over what the user already saved. It makes no model call, writes no row, and issues no request beyond the trace list the page already loads. That also means it costs nothing to run, which matters for a retention feature that should fire on every visit.

- Added `src/lib/resurfacing.ts` with six rules tried from strongest to weakest: same day in a past year, same week in a past year, same month in a past year, a place whose newest trace is over six months old, something from the early days, and as a last resort the first trace ever saved.
- Added `src/components/memory/resurfaced-rail.tsx` and placed it at the top of `/vault`, on the unfiltered view only, since resurfacing belongs to browsing rather than searching.
- Added `memory_resurfaced` and `old_trace_revisited` to the analytics allowlist. The second is the event the roadmap's retention gate is written against, so it needed to exist before that gate can ever be evaluated.

Two rules shaped the design:

- An anniversary claim requires a confirmed event date. Saying "three years ago today" based on when someone typed the memory rather than when it happened would be a factual claim the data does not support. Traces with an unknown date still surface, just never by anniversary.
- The result is stable for a given day. It changes as the date changes, not on every reload, because a memory that appears and vanishes on refresh reads as a bug rather than as serendipity.

A real bug was caught by its own test. The first version measured "how long ago" as whole elapsed years, which is correct in general but wrong for a label anchored to a calendar position: an event on 20 September 2023 seen on 2 September 2026 has only two complete years behind it, so the label read "September, 2 years ago", which a reader takes to mean September 2024. It pointed at the wrong year. The anniversary rules now use the calendar-year difference, which is the right measure here, and the reasoning is recorded in the code so it is not "simplified" back later.

Verification:

- Added `scripts/resurfacing-unit-tests.mts`: 35 of 35 checks. Coverage includes each rule and its widening, the year-wrap so early January is near late December, the exclusion of today's own traces and future dates, the refusal to infer an anniversary from a creation date, correct year naming, judging a place by its newest trace so somewhere frequently revisited is not called neglected, the limit, no duplicates, stability across two times on the same day, variation across different days, independence from input order, and that the input traces are not modified.
- `npm run test:unit` is now 218 checks across seven suites. `npm run test:e2e` stays at 178 across four HTTP suites with no regression.
- `npm run lint`, `tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run cf:build` pass.

Pre-existing local residue left untouched, since it is not this session's to remove:

- `analytics-test-20260729@example.invalid`, `session1-test-*`, and `session2-test-*` accounts remain in local D1. The first is cited as analytics verification evidence, so deleting it would orphan those event rows.
- The two stored memories are June-era rows without confirmed facts.
- Four R2 objects under the owner's own account from `2026-07-30` are not attached to any saved trace, which is draft-upload residue rather than a bug in the current cleanup path.

## Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-07-28 | English-first overseas market | Primary intended users are in the US and Europe |
| 2026-07-28 | Personal Life Atlas is the primary product | Private personal value drives activation, retention, and subscription |
| 2026-07-28 | Historical Atlas is a reviewed acquisition surface | Source-backed public content can earn search traffic and demonstrate the Atlas model |
| 2026-07-28 | Digital-only and Web-only MVP | Focus limited resources on the core value loop |
| 2026-07-28 | Private by default | Personal memories must never enter public discovery implicitly |
| 2026-07-28 | Facts and AI narrative are separate | AI must not silently rewrite time, location, people, or events |
| 2026-07-28 | Rebuild in the Next.js repository | No production users require backward compatibility; the old implementation had accumulated product drift |
| 2026-07-28 | Old production is legacy reference only | Prevents duplicate implementation and repeated regressions |
| 2026-07-28 | Public Alpha precedes billing if quality requires it | Activation and privacy are launch gates; an arbitrary billing date is not |
| 2026-09-01 | AI quota is reserved before the provider call and refunded on failure | Counting only on success lets concurrent requests share one slot; not refunding charges users for our failures |
| 2026-09-01 | A lapsed or cancelled subscription degrades to Free, never to no access | A former subscriber must keep read, export, and delete rights over memories they already own |
| 2026-09-01 | Guest quota metering uses its own device id, not the analytics anonymous id | Analytics can be switched off by the visitor, while abuse and cost metering must keep working |
| 2026-09-01 | Over-cap photo requests are refused rather than truncated | Silently dropping photos let a client exceed the rule without being told |
| 2026-09-01 | Retention has both an operator endpoint and an opportunistic sweep | A privacy promise that depends only on a correctly configured schedule is not a promise |
| 2026-09-01 | Maintenance endpoints are closed when their token is unset | A destructive endpoint must fail shut, never open, when configuration is missing |
| 2026-09-01 | The map renders from a bundled first-party outline instead of third-party tiles | Tile requests would reveal which part of the world a user is viewing to an outside provider, which contradicts the private-by-default promise |
| 2026-09-01 | First-save activation is counted from a lifetime counter, not the current row count | Otherwise deleting every trace and saving again would double-count activation |
| 2026-09-01 | Stripe writes only to `subscriptions`; entitlements are always re-derived | A dropped or delayed webhook can then only under-grant, never over-grant access |
| 2026-09-01 | `checkout.session.completed` links the customer but never sets the plan | Stripe does not guarantee event order, so a late checkout must not downgrade an active subscriber |
| 2026-09-01 | An unrecognised Stripe price maps to Free | A misconfigured or foreign price must never be able to grant a paid plan |
| 2026-09-01 | Failed media deletions are queued and retried, not just reported | "Deleting a trace deletes its photos" is only true if something guarantees the storage delete eventually happens |
| 2026-09-01 | The media sweep never deletes a key a surviving trace references | A stale queue entry must not be able to strip a photo from a live memory |
| 2026-09-02 | Photos with no date are never merged into a dated group | Assigning a date the photo does not have is exactly what the fact contract forbids |
| 2026-09-02 | Data export is free on every plan and never consults entitlements | Retrieving your own memories is a portability right, not a paid feature |
| 2026-09-02 | Account deletion requires the password, not just a session | A borrowed or stolen session must not be able to destroy someone's Atlas |
| 2026-09-02 | Deletion is refused while a paid subscription is live | Nobody may be billed for an account that no longer exists |
| 2026-09-02 | Share tokens are stored hashed, so a URL is shown only once | A database dump must not yield working links; the usability cost is worth stating honestly rather than avoiding |
| 2026-09-02 | The shared payload is an allowlist, not the stored trace | It fails closed as the schema grows, instead of leaking each new field |
| 2026-09-02 | Shared coordinates are blurred to about a kilometre | Sharing a memory must not mean sharing an address |
| 2026-09-02 | Shared photos are addressed by index, never by storage key | A storage key embeds the owner's account id, and an index leaves a recipient nothing to probe with |
| 2026-09-02 | Resurfacing never claims an anniversary without a confirmed event date | Dating a memory by when it was typed would be a factual claim the data does not support |
| 2026-09-02 | Resurfacing is stable for a given day | A memory that appears and vanishes on refresh reads as a bug, not as serendipity |

## Blockers

- Fresh production D1 and R2 resources for the rebuilt product have not been provisioned.
- Stripe account, prices, webhook endpoint, and tax configuration do not exist yet. The integration is implemented and locally verified; only the account and keys are missing.
- Historical prototype subjects have not been selected.
- Complete English privacy and terms text has not received professional legal review.
- Production needs `ADMIN_TASK_TOKEN` set before the analytics retention endpoint can be used; until then only the opportunistic sweep enforces the 90-day rule.
- First-party activation analytics are implemented and locally verified at the API/D1 layer; browser-level funnel QA and production migration remain.

## Deployment Evidence

No deployment has been made from the rebuilt repository.

The old production deployment is intentionally not an acceptance target for the rebuild.
