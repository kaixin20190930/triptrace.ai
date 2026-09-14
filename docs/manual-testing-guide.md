# TripTrace.ai Manual Testing Guide

Last updated: 2026-09-01 Asia/Shanghai

This is the canonical human QA guide for the rebuilt English-first AI Life Atlas.

Rule:

> Every user-facing feature must update this file before it is considered done.

## 1. Baseline

1. Run `npm run lint`.
2. Run `npx tsc --noEmit`.
3. Run `npm run build`.
3a. Apply pending migrations to local D1 with `npx wrangler d1 migrations apply triptrace --local`, then confirm the `d1_migrations` ledger lists every file in `migrations/`.
3b. Run `npm run test:unit`; it needs no server, no Stripe account, and must report all checks passing.
3c. With `npm run dev` running, run `npm run test:api -- http://127.0.0.1:3000` and confirm every check passes. Add `--with-ai` only when you intend to spend a real AI generation. Set `ADMIN_TASK_TOKEN` in the environment to include the analytics retention check.
3c-2. Run `STRIPE_WEBHOOK_SECRET=<local secret> ADMIN_TASK_TOKEN=<local token> npm run test:billing -- http://127.0.0.1:3000` and confirm every check passes.
3d. Run `npm run qa:cleanup` afterwards and confirm no `qa-*@example.invalid` account remains in local D1.
3e. Shortcut for all of the above: `npm run test:all` runs lint, type checking, the unit suites, and both HTTP suites, starting and stopping its own server. Run `npm run build` only after it finishes, never alongside it.
4. Test the current change on desktop and mobile widths.
5. Test signed out and signed in when auth, storage, media, or privacy is affected.
6. Do not run `npm run build` or `npm run cf:build` while `npm run dev` is still running; both modes write to `.next` and can invalidate development HMR chunks.
7. If the browser enters a Fast Refresh reload loop with `ChunkLoadError`, stop the dev server, move the stale `.next` directory aside, restart `npm run dev`, and hard-refresh the browser once.
8. Open both `http://localhost:3000` and `http://127.0.0.1:3000`; confirm form controls hydrate normally and the terminal does not report a blocked `/_next/webpack-hmr` cross-origin request.

### 1.1 Automated Suites

| Command | Needs a server | Needs secrets | What it covers |
|---|---|---|---|
| `npm run test:unit` | no | no | Map projection and geometry, Stripe signatures and event mapping, checkout payload, media retry schedule |
| `npm run test:api` | yes | optional | Privacy, ownership, deletion, entitlements, quotas, concurrency, media cleanup queue, retention endpoint |
| `npm run test:billing` | yes | optional | Webhook signatures, idempotency, event ordering, plan transitions, billing analytics |
| `npm run test:e2e` | starts its own | no | Applies local migrations, runs both HTTP suites, removes its test data |
| `npm run test:all` | starts its own | no | Lint, types, unit suites, then `test:e2e` |

Notes:

1. `test:e2e` reuses an existing `.dev.vars` without modifying it, and creates a temporary one only when the file is absent, deleting it on exit.
2. The suites create their own `qa-*@example.invalid` accounts and delete their own data. They never touch pre-existing accounts or traces.
3. `--with-ai` on `test:api` spends one real AI generation. Leave it off unless that is intended.
4. CI runs the same commands. See `.github/workflows/ci.yml`.

## 2. Product Identity

1. Open `/` in a fresh browser profile.
2. Confirm the document language and default interface are English.
3. Confirm the page title describes TripTrace as an AI Life Atlas.
4. Confirm the hero CTA says `Create your Life Atlas`.
5. Confirm the slogan reads `Every trip leaves traces. Every trace tells a story.`
6. Confirm the homepage does not promote a community feed.
7. Confirm navigation clearly separates personal Atlas tools from historical exploration.
8. Confirm `My Atlas`, `Timeline`, `Map`, and `History Atlas` open real pages.
9. Confirm the top bar does not duplicate the sidebar account control.
10. At mobile width, confirm the desktop sidebar disappears and all five primary routes remain reachable.
11. Confirm the unfinished Chinese locale is not exposed in the launch interface.

## 2.1 Large Imports And Candidate Traces

A trace holds at most 20 photos, but a real trip produces hundreds. A large import is
grouped into candidate traces by date and location, which the user reviews before anything
is generated or saved.

1. Import 5 photos and confirm they go straight into one trace, with no review list. Grouping must not appear when it is not needed.
2. Import 60 photos spanning several days and confirm a `Candidate traces` list appears, the working trace is emptied, and the total photo count matches what you imported.
3. Confirm each candidate shows its suggested date, photo count, the reason it was split, and either coordinates or `no coordinates found`.
4. Confirm no candidate contains more than 20 photos.
5. Confirm candidates are listed oldest first.
6. Confirm the reason text distinguishes a long gap, a change of place, and a split caused only by the 20-photo limit. The last one must not claim the day or place changed.
7. Import photos with no EXIF date and confirm they form their own candidate labelled `No date found in these photos`, and that this candidate shows no suggested date. A date must never be borrowed from other photos.
8. Click `Work on this one` and confirm those photos load into the trace, the suggested date and coordinates prefill the fact fields, and that candidate leaves the list.
9. Confirm the prefilled date and coordinates are still editable, and that editing them clears the fact confirmation as usual.
10. Generate, confirm the facts, and save. Confirm the remaining candidates are still listed afterwards so the next one can be started.
11. Click `Merge with next` and confirm two candidates become one, the photo count adds up, and the suggested date becomes the earlier of the two.
12. Confirm `Merge with next` is hidden when merging would exceed 20 photos.
13. Confirm `Merge with next` is hidden on the last candidate.
14. Click `Skip` and confirm that candidate disappears and its photos are not saved anywhere.
15. While signed in, confirm the list states how many AI drafts remain in the period, and that the number matches `/api/entitlements`.
16. With no AI drafts left, confirm the list says so before you start working on a candidate rather than failing at generation time.
17. Import more photos while a review list is showing and confirm the new photos are grouped in with the existing candidates rather than replacing them.
18. Re-import a photo that is already in a candidate and confirm the duplicate is skipped.
19. Import more than 200 photos and confirm the interface explains the import limit.
20. Confirm the review list states that it is not saved, then refresh and confirm the list is gone while any trace already saved is unaffected.
21. Confirm a candidate loaded into the working trace still persists through a refresh, because it is the active draft.

## 3. Capture Baseline

1. Create a text-only draft.
2. Create a photo-only draft.
3. Create a combined words-and-photos draft.
4. Select several photos, click the upload control again, and confirm new photos append instead of replacing the existing selection.
5. Add photos in multiple batches while the total stays at or below 20; confirm all earlier photos remain in the same trace.
6. Add a batch that pushes the total above 20; confirm the selection is grouped into candidate traces instead of being truncated, and see section 2.1.
7. Select the same file again while it is still present and confirm the duplicate is skipped.
8. Confirm every selected photo has a visible remove button in its top-right corner.
9. Remove a middle photo and confirm only that photo disappears, the count decreases, and the upload control becomes available again.
10. Remove the current EXIF-source photo and confirm date/GPS candidates are recalculated from the remaining photos or cleared when no candidate remains.
11. With no text entered, remove all photos and confirm the `Generate AI Trace` button is disabled because both accepted input types are empty.
12. Enter text while no photos are selected and confirm `Generate AI Trace` is enabled for text-only generation.
13. After removing a photo, select that same file again and confirm it can be added normally.
14. After generating but before saving, remove a photo and confirm it also disappears from the generated draft and is excluded from permanent save.
15. Confirm saved-cloud state does not expose the draft-only remove control.
16. Select 21 photos and confirm they are grouped into candidate traces rather than truncated; see section 2.1.
17. Select a non-image file and an image over 10 MB; confirm each has a specific error.
18. Confirm only a bounded representative set is sent for AI vision while all selected photos remain in the local preview.
19. Select a JPEG with EXIF capture date and confirm the local photo facts panel fills the event date.
20. Select a JPEG with EXIF GPS and confirm latitude and longitude populate without uploading the original first.
21. Edit or clear the detected date and coordinates before generation.
22. Generate a trace and confirm EXIF-derived date and coordinates appear in the editable confirmed facts.
23. Confirm the current build explains that guest media is temporary.
24. Generate a trace and confirm title, story, tags, place, and media render.
25. Confirm generation failure produces a visible error without losing the input.
26. Edit the generated title, story, place, date, coordinates, and people.
27. Confirm every edit clears the fact-confirmation checkbox.
28. Confirm the save action stays disabled until the fact-confirmation checkbox is selected.
29. Confirm blank date, place, coordinates, or people fields are allowed when the user explicitly confirms they are unknown.
30. Confirm an in-progress draft persists in the browser after a refresh.
31. Confirm a saved-but-not-uploaded guest draft reappears after reopening the app.
32. Confirm selected photos restore with previews and photo fact fields after draft recovery.
33. Before testing real AI locally, create `.dev.vars` from `.dev.vars.example`, set `OPENAI_API_KEY`, restart `npm run dev`, and open `GET /api/generate-memory`; confirm `configured` is `true`.
34. Generate with two visually different photos and a meaningful note; confirm the result identifies itself as `Drafted with AI`, names the configured model, and states how many representative photos were analyzed.
35. Remove or invalidate the local API key, restart development, and generate again; confirm the result clearly says `AI unavailable` and `local fallback`, and does not display a model name.
36. With no local API key, confirm the form warns about missing local AI setup before generation and points to `.dev.vars`.
37. Confirm a two-photo draft displays both photos in a split layout; confirm three and four photos use a balanced collage and five or more show a remaining-photo count.
38. Download posters with one, two, three, and four or more selected photos; confirm the photo header changes from a single hero to the corresponding collage.
39. Confirm the create area explains the four-step flow: add a moment, let AI draft, confirm facts, and save privately.
40. Confirm the primary generation button says `Draft my story with AI`.
41. While signed in, confirm facts and save; confirm the request returns `201`, the button changes to `Saved`, and the trace appears in `/vault`.
42. Force a save API error and confirm the server-provided message appears instead of an unexplained generic failure.

## 4. Account Baseline

1. Open the account dialog while signed out.
2. Trigger an invalid sign-in and confirm the error stays inside the dialog.
3. Sign in successfully.
4. Confirm the account affordance updates without reloading.
5. Sign out and confirm private account UI is removed.
6. While signed out, generate a draft and click save.
7. Confirm the account dialog opens directly and the draft does not appear permanently in My Atlas.
8. Sign in or sign up and confirm the draft remains on screen.
9. Click save again and confirm the trace and its selected photos are saved privately once.
10. While signed out, confirm the save action opens the account dialog and changes to `Sign in to save`, never `Saved`; only a successful cloud save may display `Saved`.

## 5. Vault And Timeline Baseline

1. Open `/vault` and confirm loading, empty, populated, and search states.
2. Open a trace detail from the Vault.
3. Open `/timeline` and confirm traces use event time when available.
4. Open a trace detail from the Timeline.
5. Confirm both pages remain usable at mobile width.
6. Confirm missing event dates render as `Date not set` rather than crashing.

## 6. Navigation Pages

1. Open `/explore` and confirm the page explains reviewed, source-backed Historical Atlases.
2. Confirm `/explore` does not present AI-generated historical claims as published facts.
3. Open `/map` and confirm it shows a useful empty state before any located traces exist.
4. Confirm `/map` is marked `noindex` while it is a private personal surface.
5. Follow the create and timeline links from the map empty state.
6. Confirm each public page has its own canonical URL and no title repeats `TripTrace.ai`.
7. Confirm `/vault`, `/timeline`, and `/map` are `noindex`.

## 7. Browsing Baseline

1. Open `/vault` after saving traces.
2. Confirm the photo shelf appears when saved traces have cover photos.
3. Confirm the `All`, `Photos`, and `Places` filters narrow the library without changing saved data.
4. Confirm the grid shows title, date, tags, place, and photo coverage instead of a blank shell.
5. Click a card and confirm the detail view opens with story, tags, and image preview.
6. Use the search box to filter by title, tag, and place.
7. Open `/timeline` and confirm traces are grouped by month with a clear selected preview rail.
8. Click several timeline entries and confirm the selected preview updates without losing the full list.
9. Open `/map` and confirm both the coordinate map and the place route appear when traces have places.
10. Click several places and confirm the selected place summary, trace list, and right preview all update together.
11. Click a trace inside the selected place and confirm the detail view opens from that moment.
12. Confirm trace detail separates confirmed facts from the AI-generated story.
13. Confirm trace detail shows factual note, people, place, date, tags, and AI provenance when present.
14. Confirm `Copy` writes a readable trace summary and `Image` downloads a poster image.
15. Confirm the detail view remains usable as a dialog on desktop and as a bottom drawer on mobile.
16. Click `Facts` in trace detail and edit date, date precision, place, people, and factual note.
17. Confirm fact edits cannot be saved until the confirmation checkbox is selected.
18. Save fact edits and confirm the detail view updates without closing.
19. Reopen `/vault`, `/timeline`, and `/map`; confirm edited date/place/people are reflected in cards, grouping, and place route.
20. Confirm the AI-generated story text does not change when only facts are edited.
21. Click `Story` in trace detail and edit title, story, and comma-separated tags.
22. Confirm story edits cannot be saved with a blank title or blank story.
23. Save story edits and confirm the detail view, Vault card, Timeline entry, and Map trace list update after refresh.
24. Confirm story edits do not change confirmed date, place, people, or factual note.
25. Click a trace in `/vault` and confirm the browser URL gains a `trace` query parameter.
26. Refresh `/vault?trace=<trace-id>` and confirm the same trace remains selected in the preview rail.
27. Open `/timeline?trace=<trace-id>` and confirm the selected preview matches the requested trace.
28. Open `/map?trace=<trace-id>` and confirm the matching place group, trace card, and preview are selected together.
29. Confirm traces with saved latitude and longitude show coordinate text in the map trace card.
30. Confirm the selected place summary shows map coordinates when at least one trace in that place has confirmed coordinates.
31. Open a private trace detail and click `Delete`; cancel the browser confirmation and confirm the trace remains visible.
32. Click `Delete` again, confirm the browser confirmation, and confirm the detail closes.
33. Confirm the deleted trace disappears from `/vault`, `/timeline`, and `/map` without a hard browser refresh.
34. Copy a private media URL, sign out or use a fresh browser profile, and confirm the media request is rejected.
35. After deleting a trace with media, reload the copied media URL and confirm it no longer returns the private image.

## 8. Required Failure Checks

1. API unavailable.
2. Invalid image type.
3. Oversized image.
4. Expired session.
5. R2 upload failure.
6. AI generation timeout.
7. Unauthorized private media request.
8. Entitlement limit reached.
9. A generation request containing an external image URL instead of a bounded image data URL.

Feature-specific sections will be added as the rebuilt flow lands.

## 9. First-Party Analytics

1. Apply `migrations/0008_analytics_events.sql` to the local D1 database before testing.
2. Open browser developer tools, keep the Network panel visible, and load `/`.
3. Click `Create your Life Atlas`; confirm one `POST /api/analytics` request returns `202`.
4. Enter the first non-empty memory text; confirm `personal_demo_start` and `personal_text_entered` are sent once, without the entered text.
5. Select valid photos; confirm `personal_photo_import` contains only `photoCount` and `source`.
6. Select an invalid, oversized, or 21-photo input; confirm `personal_photo_validation_failed` contains only a reason code and count.
7. Remove a photo and confirm `personal_photo_removed` contains only remaining count and whether an uploaded copy existed.
8. Import a JPEG with EXIF and confirm `personal_exif_detected` contains booleans for date/GPS, never the date or coordinates.
9. Generate successfully and confirm start/success events contain only booleans, counts, provider/model, and duration.
10. Force generation failure and confirm the failure event does not interrupt the visible product error or erase the draft.
11. Confirm facts and verify the event contains only fact-presence booleans.
12. Sign up and confirm `signup_started` and `signup_completed` are sent; verify no email or password appears in either payload.
13. Save the first trace and confirm `first_atlas_saved` is emitted once; save another trace and confirm it is not mislabeled as the first.
14. Open `/vault`, `/timeline`, and `/map`; confirm each route sends one open event after its private trace list loads.
15. Open, edit facts, edit story, and delete a trace; confirm source labels are stored but trace ID, title, story, place, people, media URL, and coordinates are absent.
16. Query local D1 and confirm signed-out rows have a null `user_id`, while signed-in rows attach the current user ID.
17. Send an unsupported event name and confirm the API returns `400 invalid_event`.
18. Send a payload over 8 KB and confirm the API returns `413 payload_too_large`.
19. Set `localStorage["triptrace:analytics-disabled"]` to `"true"`, repeat an action, and confirm no analytics request is sent.
20. Enable Global Privacy Control or Do Not Track in a supporting browser and confirm no analytics request is sent.
21. Confirm an analytics endpoint failure never blocks generation, registration, saving, browsing, editing, or deletion.
22. Reach a plan limit and confirm one `paywall_viewed` event is sent with only `source` and the entitlement `reason` code.

### 9.1 Ninety-Day Retention

Raw analytics rows must never live longer than 90 days. The operator endpoint is the
guaranteed path; the write endpoint also sweeps opportunistically so the rule still holds
if no schedule is configured.

1. With `ADMIN_TASK_TOKEN` unset, call `GET /api/admin/analytics/cleanup` and confirm `503 admin_token_missing`. The endpoint must be closed by default, not open by default.
2. Set `ADMIN_TASK_TOKEN` in `.dev.vars`, restart development, and call the same route with no header and then with a wrong header; confirm `403 admin_forbidden` both times.
3. Call it with the correct `x-triptrace-admin-token` header and confirm the response reports `retentionDays: 90`, a cutoff 90 days in the past, and the number of expired rows.
4. Insert analytics rows with `received_at` older than 90 days plus one row inside the window.
5. `POST` the same route and confirm only the expired rows are deleted, the in-window row survives, and `remaining` returns to `0`.
6. `POST` again and confirm `deleted` is `0`, so repeating the sweep is safe.
7. Confirm the response never contains event contents, only counts and the cutoff.
8. Before production collection begins, confirm a schedule calls this endpoint, or accept the opportunistic sweep and record that decision.

## 9.2 Coordinate Map

The map renders from a bundled outline served by this site. Confirming that is part of the
test, because the privacy promise depends on it.

1. Open `/map` with the browser Network panel visible and confirm exactly one map data request, `GET /world-land.json`, served from the app origin.
2. Confirm no request goes to any external map, tile, font, or geocoding host.
3. With no located traces, confirm the map shows the graticule, says `No confirmed coordinates yet`, and explains how to add coordinates.
4. Save traces with confirmed latitude and longitude and confirm each appears as a point in the correct part of the world.
5. Confirm the map fits itself to the located traces on first load rather than showing the whole world at maximum zoom out.
6. Click a point and confirm the correct trace becomes selected, the right-hand preview updates, the place route highlights the matching place, and the URL gains the matching `?trace=` value.
7. Click the same point again and confirm the trace detail opens.
8. Refresh `/map?trace=<trace-id>` and confirm that trace is selected and its point is highlighted.
9. Save two traces at the same coordinates and confirm they collapse into one point showing the count, and that activating it selects a trace from that spot.
10. Confirm traces are connected by a dashed line in chronological order, not in the order they were saved.
11. Drag to pan and confirm the view cannot be dragged outside the world.
12. Scroll to zoom on desktop and pinch to zoom on a touch device; confirm the point under the cursor stays under the cursor while zooming with the wheel.
13. Confirm the zoom in, zoom out, and fit buttons work and each has an accessible label.
14. Tab to a point and press `Enter` and then `Space`; confirm both activate it and the focus ring is visible.
15. Confirm markers stay a readable size at both the widest and the closest zoom.
16. Confirm traces without coordinates are not plotted but still appear in the place route and the trace list, with a line stating how many are unlocated.
17. Confirm the map does not geocode a place name and does not infer coordinates from story text: a trace with a place but no coordinates must not appear as a point.
18. Block `/world-land.json` in the Network panel and reload; confirm the map still shows points and states that the outline could not be loaded.
19. Confirm the map is usable at mobile width and does not trap page scrolling outside the map area.
20. Switch between light and dark themes and confirm land, water, graticule, and points all remain legible.

Automated coverage: `npm run test:unit` verifies the projection, view clamping, fitting,
zoom anchoring, marker grouping, chronological connector, and the bundled outline. Run it
after any change to `src/lib/atlas-projection.ts` or the outline asset.

If the outline ever needs regenerating, run `npm run build:world-land` against a Natural
Earth 1:110m land GeoJSON. The output is committed on purpose so builds stay offline.

## 8.1 Media Deletion And Retry

Deleting a trace removes the database row immediately, which is what makes its photos
unreachable: media access is authorised by looking up a referencing trace. Removing the R2
object is a second step that can fail, so failures are queued and retried.

1. Delete a trace with photos and confirm the response reports the media key count, `mediaCleanupFailed: false`, and nothing queued.
2. Reload a previously copied media URL for that trace and confirm it no longer returns the image.
3. Call `GET /api/admin/media/cleanup` with the operator token and confirm the queue is empty and `needsAttention` is false.
4. Call it without a token and confirm `403`, or `503` when `ADMIN_TASK_TOKEN` is unset.
5. Confirm the report contains only counts and timestamps, never media keys. A key identifies a specific private photo.
6. To exercise the retry path, insert a `media_cleanup_queue` row for a real uploaded key with `next_attempt_at` in the past, then `POST /api/admin/media/cleanup` and confirm the object is deleted and the row is cleared.
7. Insert a queue row for a key that a surviving trace still references, sweep, and confirm the object is **not** deleted and the row is dropped instead. A live memory must never lose its photo to the queue.
8. Sweep an empty queue and confirm it is a safe no-op.
9. If `abandoned` is ever above zero, confirm `needsAttention` is true. Those keys have exhausted their retries and will not be tried again without intervention.
10. Before production, decide whether a schedule calls this endpoint, and record the decision.

## 9.3 Owner-Only Analytics Summary

1. Call `GET /api/admin/analytics/summary` with no token and confirm `403`, or `503` when `ADMIN_TASK_TOKEN` is unset.
2. Call it with the correct token and confirm it returns counts per event name, distinct visitor counts, and totals.
3. Confirm the response contains no story text, no coordinates, no emails, and no event properties of any kind.
4. Add `?days=7` and confirm the window narrows; add `?days=999` and confirm it is capped at the 90-day retention window.
5. Add `?userId=<id>` and confirm the counts narrow to that account.

## 10. Plans, Quotas, And Server-Side Limits

Apply `migrations/0009_entitlements.sql` before testing this section.

Limits under test:

| Plan | Permanent traces | AI generations | Images per trace |
|---|---:|---:|---:|
| Guest | 0 | 1 lifetime | 20 |
| Free | 3 | 5 per UTC month | 20 |
| Founding Plus | 500 | 50 per UTC month | 20 |

### 10.1 Read Model

1. Signed out, open `/api/entitlements`; confirm `plan.key` is `guest`, `limits.permanentTraces` is `0`, and `canSavePermanentTraces` is `false`.
2. Sign up a new account and open `/api/entitlements`; confirm `plan.key` is `free`, `usage.permanentTraces.used` is `0`, and `usage.aiGenerations.periodKey` is the current `YYYY-MM` in UTC.
3. Save a trace, reload `/api/entitlements`, and confirm `usage.permanentTraces.used` increased and `remaining` decreased.
4. Delete that trace and confirm the used count drops again, because deletion frees a slot.

### 10.2 Guest Demo

1. In a fresh browser profile, generate one draft while signed out and confirm it succeeds.
2. Generate again on the same device and confirm the draft is refused with a message about the used guest draft.
3. Confirm the refusal keeps the entered text, the selected photos, and the photo fact fields on screen.
4. Clear `localStorage`, generate again, and confirm the request is still metered rather than reset for free. On a shared local IP this may remain refused; that is the intended fallback.
5. Sign up, generate again, and confirm the Free allowance now applies.

### 10.3 Free Plan Limits

1. Save three traces and confirm each one succeeds.
2. Attempt a fourth save and confirm it is refused with copy naming the Free limit and the Founding Plus alternative.
3. Confirm the refused draft stays on screen and is not silently discarded.
4. Delete one saved trace, save again, and confirm it now succeeds.
5. Generate five AI drafts in the same UTC month, attempt a sixth, and confirm it is refused with the monthly-allowance message.
6. Confirm a refused generation does not clear the draft or the confirmed facts.

### 10.4 Failure Must Not Charge The User

1. Remove the local `OPENAI_API_KEY`, restart development, and generate. Confirm the result is a labelled local fallback and that `usage.aiGenerations.used` in `/api/entitlements` does not increase.
2. Restore the key, force a provider error, and confirm the same: a fallback draft appears and the used count is unchanged.
3. Confirm a successful AI draft does increase the used count by exactly one.

### 10.5 Direct API Calls Must Not Bypass Limits

Run these with `curl` or any HTTP client, not through the interface.

1. `POST /api/memories` while signed out; confirm `401 unauthorized`.
2. `POST /api/memories` with 21 `photoKeys` while signed in; confirm `400 entitlement_image_limit_exceeded` rather than a silently truncated save.
3. `POST /api/media` with 21 files; confirm `400 entitlement_image_limit_exceeded` and confirm no object was written to R2.
4. `POST /api/generate-memory` with `photoCount` above the cap; confirm `400 entitlement_image_limit_exceeded`.
5. With the trace allowance full, send five `POST /api/memories` requests in parallel; confirm every one is refused and the stored trace count is unchanged.
6. With one generation left in the period, send three `POST /api/generate-memory` requests in parallel; confirm exactly one succeeds and the others return `403 entitlement_generation_limit_reached`.
7. Confirm every refusal body contains a stable `error.code` plus an `entitlement` block with `planKey`, `limit`, `used`, and `remaining`.
8. Send more than ten guest generation requests within an hour from one IP and confirm the route starts returning `429 rate_limited` with a `Retry-After` header.

### 10.6 Plan Changes Without Stripe

Plan state can always be set by writing a `subscriptions` row directly, which is the
fastest way to check the entitlement layer in isolation.

1. Insert an `active` `founding_plus` row with a future `current_period_end`; confirm `/api/entitlements` reports 500 traces and 50 generations.
2. Set `current_period_end` to a past date; confirm the plan degrades to Free.
3. Set `status` to `canceled`; confirm the plan degrades to Free while the account keeps read, edit, and delete rights over existing traces.
4. Confirm a degraded account can still open, edit, export, and delete traces it already saved.

## 11. Billing

Pricing is fixed: Founding Plus is `$9.99` per month or `$79` per year. Do not change these
figures while testing.

### 11.1 Plan Page

1. Open `/plan` while signed out and confirm it explains the guest allowance and links to account creation, with upgrade buttons disabled.
2. Sign in and confirm the page shows the current plan, saved-trace usage, and AI-draft usage with correct numbers against `/api/entitlements`.
3. Confirm the usage bars have accessible names and report the same used and limit values as the API.
4. Confirm the page states that a cancelled plan keeps read, export, and delete rights.
5. Confirm `/plan` is `noindex`, since it is a private account surface.
6. Confirm the account dropdown in the sidebar links to `/plan` as a real link, so it can be opened in a new tab.

### 11.2 Configuration States

1. With no `STRIPE_SECRET_KEY`, click an upgrade button and confirm the visible message says billing is not available rather than showing a raw failure.
2. With no `STRIPE_WEBHOOK_SECRET`, post anything to `/api/billing/webhook` and confirm `503 billing_not_configured`. The webhook must never accept an unverifiable delivery.
3. With a key configured but the requested price missing, confirm `503 billing_price_missing`.
4. Confirm `POST /api/billing/checkout` and `POST /api/billing/portal` both return `401` when signed out.
5. Confirm `POST /api/billing/portal` returns `409 billing_no_customer` for an account with no billing history.

### 11.3 Stripe Test Mode

Use Stripe test keys and the Stripe CLI. Never use live keys for QA.

1. `stripe listen --forward-to http://127.0.0.1:3000/api/billing/webhook` and copy the printed `whsec_` value into `.dev.vars`.
2. Start a monthly checkout from `/plan`, pay with the `4242 4242 4242 4242` test card, and confirm the browser returns to `/plan?checkout=success`.
3. Confirm the page states that the plan updates once Stripe confirms, and that the plan becomes Founding Plus after the webhook arrives.
4. Confirm `/api/entitlements` then reports 500 traces and 50 monthly AI drafts.
5. Save more than 3 traces and confirm the previous Free limit no longer applies.
6. Repeat with the annual price and confirm it also grants Founding Plus.
7. Start a checkout and abandon it; confirm the plan does not change and `/plan?checkout=cancelled` says nothing was charged.
8. Open the customer portal, cancel at period end, and confirm the plan stays Founding Plus while the page shows that it cancels at period end.
9. Let the cancellation take effect, or trigger `customer.subscription.deleted`, and confirm the account returns to Free.
10. Confirm every trace saved while on Founding Plus is still readable, editable, exportable, and deletable after returning to Free.
11. Use `stripe trigger` to resend a delivered event and confirm the response reports `duplicate` without changing state.
12. Stop the forwarder, change the plan in Stripe, restart the forwarder, and confirm the queued events reconcile the plan correctly.
13. Confirm a `payment_failed` state does not immediately revoke access mid-period.

### 11.4 Security Checks

1. Post an unsigned webhook and confirm `400 stripe_missing_signature`.
2. Post a webhook signed with the wrong secret and confirm `400 stripe_signature_mismatch`.
3. Sign a payload, then modify one character before sending, and confirm `400 stripe_signature_mismatch`.
4. Sign a payload with a timestamp an hour old and confirm `400 stripe_timestamp_out_of_tolerance`, so a captured request cannot be replayed indefinitely.
5. Send a subscription event whose price id is not one of the configured prices and confirm the account is not granted a paid plan.
6. Send an event whose metadata names another account id and confirm no plan is attached to it.
7. Confirm no client request can set a plan: `PATCH`ing or `POST`ing plan fields anywhere must have no effect on entitlements.
8. Confirm the analytics summary shows one `subscription_started` per real transition, not one per Stripe update.

Automated coverage: `npm run test:unit` covers the checkout payload, price mapping, signature
primitives, and event mapping with no network. `npm run test:billing` drives the live webhook
endpoint with locally signed payloads and asserts acceptance, rejection, idempotency,
ordering, plan transitions, and billing analytics. Neither needs a Stripe account.
