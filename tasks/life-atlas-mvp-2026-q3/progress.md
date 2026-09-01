# Life Atlas MVP Progress

Last updated: 2026-09-01 Asia/Shanghai

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

1. `PA-205/PA-206 follow-up` Narrative-quality acceptance with genuine personal travel and life photos. Only the owner can supply these; unrelated private images on this machine must not be substituted.
2. `M2-010/PA-601/PA-602 follow-up` Observe `first_atlas_saved` once in a signed-in browser. The server flag and the client trigger are both verified in code and by API test; the remaining step is a real browser save.
3. Section 10 of `docs/manual-testing-guide.md` in a real browser, especially the guest-demo refusal and the Free-plan limit copy.

Remaining engineering work:

4. `PA-901` Add the 90-day `analytics_events` cleanup path so production collection can start.
5. `RB-301` Provision fresh production D1/R2 resources and record migration, binding, and smoke-test evidence.
6. `PA-301/PA-302 follow-up` Replace the place-route placeholder with a real coordinate point map.
7. `PA-405 to PA-410` Stripe checkout, webhook, and portal on top of the now-enforceable entitlement layer.
8. `PA-108 follow-up` Observability for R2 media cleanup retries.

## Completion Snapshot

| Area | Status | Notes |
|---|---|---|
| Product scope and roadmap | DONE | English-first personal Life Atlas, historical acquisition, digital-only, Web-only scope recorded |
| Active repository cutover | DONE | `/Users/liukai/Documents/triptrace.ai` is the only implementation target |
| English product shell | DONE | Homepage, metadata, navigation, account entry, and core routes exist |
| Text/photo capture | IN_PROGRESS | 1-20 images, multi-batch append, duplicate skipping, removable previews, compression, JPEG EXIF time/GPS extraction, and bounded vision inputs work; HEIC/advanced EXIF remains later |
| AI generation | IN_PROGRESS | Real OpenAI vision generation, owner two-photo analysis, and browser text-generation QA pass; genuine personal-life narrative quality and failure-path QA remain |
| Fact confirmation | IN_PROGRESS | Required before create and fact PATCH; date, coordinates, place, people, and factual note are editable |
| Anonymous draft preservation | IN_PROGRESS | IndexedDB draft restore and sign-up-to-save path exist; needs broader manual QA |
| Private save and R2 media | IN_PROGRESS | Default private save, signed-in upload, owner-only media reads, and deletion cleanup exist; needs automated API coverage |
| Vault | IN_PROGRESS | Search, filters, photo shelf, cards, and detail open exist; year/person filters are incomplete |
| Timeline | IN_PROGRESS | Event-date grouping, detail open, selected preview, and `?trace=` deep-link selection exist |
| Map | IN_PROGRESS | Place-route browser, coordinate display, trace highlighting, and `?trace=` selection exist; real MapLibre/OpenFreeMap point map is not implemented |
| Trace detail | IN_PROGRESS | Facts/story separation, fact editor, narrative editor, copy, and poster download exist |
| Historical Atlas | NOT_STARTED | `/explore` is a placeholder/acquisition surface only |
| Analytics | IN_PROGRESS | Browser events through generation and fact confirmation are verified in local D1; signed-in first-save and production evidence remain |
| Sharing/export/deletion | IN_PROGRESS | Copy, poster export, and owner-only trace deletion exist; selected share links and account deletion are incomplete |
| Entitlements and server limits | DONE | Plan resolution, usage metering, and server enforcement on generate/media/memories are implemented and verified by 37 automated API checks |
| Automated API and privacy tests | IN_PROGRESS | `scripts/api-entitlement-tests.mjs` covers privacy, ownership, deletion, and every entitlement rule against local D1/R2; it is not yet wired into a CI runner |
| Billing | NOT_STARTED | Stripe checkout, webhooks, and customer portal are not implemented; the entitlement layer they need is now in place |
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

## Blockers

- Fresh production D1 and R2 resources for the rebuilt product have not been provisioned.
- Stripe account, products, webhook secret, and tax configuration have not been verified.
- Historical prototype subjects have not been selected.
- Complete English privacy and terms text has not received professional legal review.
- Raw `analytics_events` rows have no scheduled 90-day cleanup yet, which blocks production collection.
- First-party activation analytics are implemented and locally verified at the API/D1 layer; browser-level funnel QA and production migration remain.

## Deployment Evidence

No deployment has been made from the rebuilt repository.

The old production deployment is intentionally not an acceptance target for the rebuild.
