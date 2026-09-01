# TripTrace.ai Next Implementation Plan

Last updated: 2026-07-29 Asia/Shanghai

Status: proposed execution plan after the rebuilt personal activation loop

Canonical status: `tasks/life-atlas-mvp-2026-q3/progress.md`

## 1. Goal

Turn the current rebuilt Life Atlas into a measurable, enforceable, deployable Public Alpha candidate.

The next implementation wave has three product outcomes:

1. Know whether users reach activation.
2. Enforce product limits from the server, not from UI copy.
3. Make the Atlas feel spatial through a real coordinate map.

## 2. Current Baseline

Already implemented:

- English-first AI Life Atlas product shell.
- Text/photo capture with 1-20 images.
- Client image validation, previews, compression, and JPEG EXIF date/GPS extraction.
- OpenAI-backed trace generation with local fallback.
- Private-by-default saved traces.
- Fact confirmation before permanent save.
- Editable confirmed facts and editable AI narrative.
- Vault, Timeline, and Map browsing surfaces.
- `?trace=` deep-link selection across Vault, Timeline, and Map.
- Owner-only private media reads.
- Owner-only trace deletion with best-effort R2 cleanup.

Still missing for Public Alpha readiness:

- First-party analytics.
- Server-side usage and plan limits.
- Production D1/R2 provisioning evidence.
- Real coordinate point map.
- Automated API/privacy tests.
- Stripe subscription flow.
- Historical Atlas acquisition pages.

## 3. Execution Order

Recommended order:

1. Analytics foundation.
2. Entitlement and usage limits.
3. Production resource preparation.
4. Real coordinate map.
5. Automated privacy and deletion tests.
6. Stripe billing.
7. Historical Atlas prototype.

Reasoning:

- Analytics must land before traffic, otherwise product decisions are blind.
- Entitlements must land before Stripe, otherwise payment cannot safely control access.
- Production resources should be prepared before billing and public launch.
- The real map improves perceived product value, but it should not precede privacy or limits.
- Historical SEO is important, but the private conversion product must be measurable first.

## 4. Workstream A: First-Party Activation Analytics

Task IDs:

- `M2-010`
- `PA-601`
- `PA-602`

### 4.1 Product Purpose

Measure the exact funnel from visitor to saved private Atlas.

Primary questions:

- How many visitors start creating?
- How many upload photos?
- How many generate an AI trace?
- How many edit or confirm facts?
- How many sign up to save?
- How many return to Vault, Timeline, or Map?
- Where do failures happen?

### 4.2 Data Model

Add migration:

- `analytics_events`

Columns:

- `id TEXT PRIMARY KEY`
- `event_name TEXT NOT NULL`
- `anonymous_id TEXT NOT NULL`
- `user_id TEXT`
- `session_id TEXT`
- `properties_json TEXT NOT NULL DEFAULT '{}'`
- `occurred_at TEXT NOT NULL`
- `received_at TEXT NOT NULL`

Indexes:

- `idx_analytics_events_name_received_at`
- `idx_analytics_events_user_received_at`
- `idx_analytics_events_anonymous_received_at`

Privacy rules:

- Do not store story text.
- Do not store photo contents.
- Do not store exact private coordinates.
- Do not store passwords, cookies, tokens, or payment data.
- Store coarse counts and booleans only.
- Respect Global Privacy Control, Do Not Track, and the local analytics opt-out flag.
- Retain raw event rows for no more than 90 days; production collection requires a scheduled cleanup path.

### 4.3 API

Add endpoint:

- `POST /api/analytics`

Request:

```json
{
  "eventName": "personal_demo_start",
  "anonymousId": "anon_xxx",
  "sessionId": "sess_client_xxx",
  "occurredAt": "2026-07-29T00:00:00.000Z",
  "properties": {
    "source": "home_hero"
  }
}
```

Server behavior:

- Validate event name against allowlist.
- Attach `user_id` when signed in.
- Sanitize properties against per-event allowlist.
- Reject payloads over 8 KB.
- Rate-limit the public write endpoint.
- Always return quickly.
- Never block core product flow when analytics fails on the client.

### 4.4 Client Helper

Add:

- `src/lib/analytics.ts`

Responsibilities:

- Create or reuse local anonymous ID.
- Create a per-tab or per-session session ID.
- Send allowlisted events.
- Swallow network errors.
- Avoid sending private content.

### 4.5 Initial Events

Activation events:

- `personal_cta_click`
- `personal_demo_start`
- `personal_text_entered`
- `personal_photo_import`
- `personal_photo_validation_failed`
- `personal_exif_detected`
- `personal_story_generate_started`
- `personal_story_generated`
- `personal_story_generate_failed`
- `personal_fact_confirmed`
- `signup_started`
- `signup_completed`
- `first_atlas_saved`
- `trace_opened`
- `trace_story_edited`
- `trace_facts_edited`
- `trace_deleted`
- `vault_opened`
- `timeline_opened`
- `map_opened`

Later billing events:

- `paywall_viewed`
- `checkout_started`
- `subscription_started`
- `subscription_cancelled`

### 4.6 Minimal Reporting

Add an owner-only local/report route later:

- `GET /api/admin/analytics/summary`

Initial CLI or API summary is enough before a polished dashboard.

Metrics:

- visitors by anonymous ID
- demo starts
- imports
- generation starts
- generation success rate
- fact confirmations
- signups
- first saves
- return browsing opens
- deletes

### 4.7 Acceptance Criteria

Analytics is done when:

1. Events are stored in D1.
2. Signed-in events attach user ID.
3. Guest events attach anonymous ID.
4. Private content is not stored.
5. Capture, generation, save, browse, edit, and delete events are instrumented.
6. Manual testing guide includes analytics verification.
7. Browser privacy signals and local opt-out prevent client collection.
8. The 90-day raw-event retention rule is documented for production cleanup.
9. `npm run lint`, `tsc --noEmit`, `npm run build`, and `npm run cf:build` pass.

## 5. Workstream B: Entitlements And Server-Side Limits

Task IDs:

- `PA-401`
- `PA-402`
- `PA-403`
- `PA-404`

### 5.1 Product Purpose

Prepare the product for charging without relying on UI-only restrictions.

Launch plans:

| Plan | Permanent traces | Monthly AI generations | Images per trace |
|---|---:|---:|---:|
| Guest | 0 | 1 temporary demo | 20 |
| Free | 3 | 5 | 20 |
| Founding Plus | 500 | 50 | 20 |

Billing price target:

- Founding Plus monthly: `$9.99/month`
- Founding Plus annual: `$79/year`
- Future Pro anchor: `$19/month`

### 5.2 Data Model

Add migration:

- `subscriptions`
- `usage_counters`

`subscriptions`:

- `id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL UNIQUE`
- `provider TEXT NOT NULL DEFAULT 'manual'`
- `provider_customer_id TEXT`
- `provider_subscription_id TEXT`
- `plan_key TEXT NOT NULL DEFAULT 'free'`
- `status TEXT NOT NULL DEFAULT 'active'`
- `current_period_end TEXT`
- `cancel_at_period_end INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

`usage_counters`:

- `user_id TEXT NOT NULL`
- `period_key TEXT NOT NULL`
- `metric_key TEXT NOT NULL`
- `count INTEGER NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`
- primary key `(user_id, period_key, metric_key)`

### 5.3 Entitlement Service

Add:

- `src/lib/server/entitlements.ts`

Responsibilities:

- Resolve plan for user.
- Default signed-in users to `free`.
- Resolve guest limits without account.
- Check trace count limit.
- Check monthly AI generation limit.
- Check image count limit.
- Increment usage only after successful operation where appropriate.

### 5.4 Server Enforcement Points

Enforce:

- `/api/generate-memory`
- `/api/media`
- `/api/memories`

Rules:

- Guest can generate one temporary demo per anonymous ID.
- Guest cannot permanently save.
- Free can save up to 3 traces.
- Free gets 5 monthly AI generations.
- Founding Plus gets 500 traces and 50 monthly AI generations.
- Direct API calls cannot bypass limits.

### 5.5 UI Behavior

Add contextual upgrade/limit states:

- Generation limit reached.
- Save limit reached.
- Too many images.
- Signed-out save requires account.

Do not add aggressive paywalls yet.

### 5.6 Acceptance Criteria

Entitlements are done when:

1. Plan and usage tables exist.
2. Server rejects over-limit direct API calls.
3. Client shows understandable limit messages.
4. Existing happy paths still work.
5. Manual testing guide includes guest/free/plus limit tests.
6. Analytics logs limit views or failures.
7. Build and type checks pass.

## 6. Workstream C: Production Resource Preparation

Task IDs:

- `RB-301`
- `PA-901`

### 6.1 Product Purpose

Move from rebuild-only local validation to a deployable Public Alpha candidate.

### 6.2 Cloudflare Resources

Provision or verify:

- Fresh D1 database for rebuilt TripTrace.
- Fresh R2 bucket for private media.
- Environment variables for OpenAI.
- Session cookie settings.
- Cloudflare Pages/Workers deployment target.

### 6.3 Required Secrets

Required:

- `OPENAI_API_KEY`
- D1 binding
- R2 binding as `MEDIA`
- Auth/session secret if current auth flow adds one later

Future Stripe:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FOUNDING_MONTHLY`
- `STRIPE_PRICE_FOUNDING_ANNUAL`

### 6.4 Deployment Evidence

Record in `progress.md`:

- Deployment URL.
- Commit hash.
- Migration status.
- D1 database name.
- R2 bucket name.
- Smoke test checklist result.
- Known issues.

### 6.5 Acceptance Criteria

Production prep is done when:

1. Fresh resources exist.
2. Migrations apply successfully.
3. A release candidate URL is deployed.
4. Guest generation works.
5. Sign-up works.
6. Signed-in upload and save work.
7. Private media cannot be read when signed out.
8. Delete removes trace and blocks media access.

## 7. Workstream D: Real Coordinate Point Map

Task IDs:

- `PA-301 follow-up`
- `PA-302 follow-up`
- `PA-303`

### 7.1 Product Purpose

Upgrade the Map route from a place-route list into a visible spatial Atlas.

### 7.2 Recommended Implementation

Use MapLibre with OpenFreeMap or another low-cost vector/raster style.

Reasons:

- Good WebGL support.
- No native app dependency.
- Can later support replay and richer routes.
- Keeps 3D optional rather than foundational.

### 7.3 UI Scope

Map page should include:

- Interactive 2D map.
- Points for traces with latitude/longitude.
- Selected point highlights selected trace.
- Clicking a point updates `?trace=`.
- Clicking timeline/place list updates selected point.
- Empty coordinate state remains useful.
- Fallback list remains available when no coordinates exist.

Do not include:

- Full 3D globe.
- Continuous route interpolation.
- Heatmaps.
- Public social map.

### 7.4 Data Rules

- Use confirmed `latitude` and `longitude`.
- Do not geocode private place names server-side in this wave.
- Do not infer coordinates from story text.
- Keep user-editable coordinates as source of truth.

### 7.5 Acceptance Criteria

Map follow-up is done when:

1. Traces with coordinates appear as map points.
2. Point click opens or selects the correct trace.
3. `?trace=` selection updates map and side preview.
4. Map works on desktop and mobile.
5. No-coordinate traces remain visible in a list.
6. Manual testing guide covers map point behavior.
7. Build and Cloudflare build pass.

## 8. Workstream E: Automated Privacy And API Tests

Task IDs:

- `PA-105 follow-up`
- `PA-106 follow-up`
- `PA-108 follow-up`

### 8.1 Product Purpose

Protect against regressions in the highest-risk area: private memories and media.

### 8.2 Test Coverage

Add tests for:

- Signed-out user cannot list private traces.
- User A cannot list User B private traces.
- User A cannot read User B private media.
- Public trace media can be read.
- Private trace media can be read by owner.
- Delete rejects signed-out requests.
- Delete rejects non-owner requests.
- Delete removes memory row.
- Delete attempts R2 cleanup.
- PATCH requires owner.
- Fact PATCH requires confirmation when factual fields change.

### 8.3 Acceptance Criteria

Tests are done when:

1. Privacy tests run locally.
2. Tests can run without production data.
3. Failure messages identify the violated rule.
4. Manual guide references the automated coverage.

## 9. Workstream F: Stripe Billing

Task IDs:

- `PA-405`
- `PA-406`
- `PA-407`
- `PA-408`
- `PA-409`
- `PA-410`
- `PA-603`

### 9.1 Product Purpose

Convert activated users after server-side entitlements are already trustworthy.

### 9.2 Required Flow

1. User reaches a meaningful limit.
2. Product shows Founding Plus upgrade prompt.
3. User starts Stripe Checkout.
4. Webhook verifies subscription.
5. D1 subscription state updates.
6. Entitlement service grants Plus limits.
7. User can open Stripe customer portal.
8. Cancellation keeps export and deletion rights.

### 9.3 Acceptance Criteria

Stripe is done when:

1. Test checkout works.
2. Webhook signature is verified.
3. Duplicate webhook is idempotent.
4. Entitlement refresh is visible in UI and API.
5. Customer portal works.
6. Billing analytics events are stored.
7. Manual test guide includes checkout, cancellation, stale subscription, and webhook failure.

## 10. Workstream G: Historical Atlas Prototype

Task IDs:

- `PA-701`
- `PA-702`
- `PA-703`
- `PA-704`
- `PA-705`

### 10.1 Product Purpose

Build the first acquisition surface that demonstrates the Atlas concept and sends users into personal creation.

### 10.2 MVP Subject Criteria

Select a deceased 18th-20th century person with:

- Strong geographic movement.
- Clear chronology.
- Public-domain or licensed images.
- English search demand.
- Source availability.
- Low privacy and controversy risk.

### 10.3 Initial Candidate Types

Good categories:

- Explorers and travelers.
- Writers in exile.
- Scientists moving across institutions.
- Artists with clear geographic periods.
- Political leaders with documented journeys.

### 10.4 Acceptance Criteria

Historical prototype is done when:

1. One route has useful indexable HTML.
2. Every trace has source and confidence.
3. Map and timeline are synchronized.
4. Page has title, description, canonical, OG, structured data, and sitemap entry.
5. Personal CTA sends visitor to creation.
6. Analytics records history page and CTA interactions.

## 11. Recommended Implementation Timeline

Assuming one builder plus ChatGPT, roughly 8 hours per workday.

| Phase | Duration | Deliverable |
|---|---:|---|
| A Analytics foundation | 1.0-1.5 days | Event table, endpoint, client helper, core instrumentation |
| B Entitlements and limits | 1.5-2.0 days | Plan resolver, usage counters, server-side limit enforcement |
| C Production resource prep | 0.5-1.0 day | D1/R2 setup, migrations, release candidate evidence |
| D Real coordinate map | 1.0-1.5 days | MapLibre/OpenFreeMap point map and trace selection |
| E Automated privacy/API tests | 1.0 day | Privacy, owner access, delete, media tests |
| F Stripe billing | 2.0-3.0 days | Checkout, webhook, subscription state, portal |
| G Historical prototype 1 | 2.0-3.0 days | One reviewed English historical Atlas page |

Minimum viable Public Alpha candidate:

- A, B, C, E completed.
- D strongly recommended.
- F can follow after quality gates if activation is not yet proven.
- G can begin after analytics is live so history-to-personal conversion is measurable.

## 12. Immediate Next Sprint

Sprint target:

`Analytics + Entitlement Foundation`

Day 1:

- Add analytics migration.
- Add `/api/analytics`.
- Add client analytics helper.
- Instrument homepage CTA, capture start, photo import, generate start/success/failure, save success, browse opens, edit, delete.
- Update manual testing guide.

Day 2:

- Add subscriptions and usage counters migrations.
- Add entitlement service.
- Enforce free trace count and AI generation count.
- Add limit UI copy.
- Instrument limit events.
- Update progress and manual testing.

Day 3:

- Add automated API/privacy smoke tests if the local test harness is ready.
- If test harness is not ready, add script-based endpoint checks against local dev.
- Run full build and Cloudflare build.
- Record readiness and remaining blockers in `progress.md`.

## 13. Go / No-Go Gates Before Public Alpha

Go only if:

1. A guest can generate once without account.
2. Sign-up to save does not lose the draft.
3. Saved traces are private by default.
4. Private media is not readable signed out or cross-account.
5. Delete removes trace and blocks media access.
6. Analytics records activation funnel without private content.
7. Server-side limits cannot be bypassed.
8. Production deployment has recorded evidence.
9. Manual testing guide passes desktop and mobile.

No-go if:

1. Any private media can be read by an unrelated user.
2. AI can overwrite factual fields without confirmation.
3. Save/delete causes data loss outside the target trace.
4. Billing UI can grant entitlement without server verification.
5. Production resources are unclear or mixed with legacy state.
