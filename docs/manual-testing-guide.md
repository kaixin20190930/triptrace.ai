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
3b. With `npm run dev` running, run `npm run test:api -- http://127.0.0.1:3000` and confirm every check passes. Add `--with-ai` only when you intend to spend a real AI generation. Set `ADMIN_TASK_TOKEN` in the environment to include the analytics retention check.
3c. Run `npm run qa:cleanup` afterwards and confirm no `qa-entitlements-*` or `qa-gen-quota-*` account remains in local D1.
4. Test the current change on desktop and mobile widths.
5. Test signed out and signed in when auth, storage, media, or privacy is affected.
6. Do not run `npm run build` or `npm run cf:build` while `npm run dev` is still running; both modes write to `.next` and can invalidate development HMR chunks.
7. If the browser enters a Fast Refresh reload loop with `ChunkLoadError`, stop the dev server, move the stale `.next` directory aside, restart `npm run dev`, and hard-refresh the browser once.
8. Open both `http://localhost:3000` and `http://127.0.0.1:3000`; confirm form controls hydrate normally and the terminal does not report a blocked `/_next/webpack-hmr` cross-origin request.

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

## 3. Capture Baseline

1. Create a text-only draft.
2. Create a photo-only draft.
3. Create a combined words-and-photos draft.
4. Select several photos, click the upload control again, and confirm new photos append instead of replacing the existing selection.
5. Add photos in multiple batches until the total reaches 20; confirm all earlier photos remain and the upload control becomes disabled at the 20-photo limit.
6. With fewer than 20 photos selected, choose more photos than the remaining slots; confirm only the available number is appended and a clear limit message appears.
7. Select the same file again while it is still present and confirm the duplicate is skipped.
8. Confirm every selected photo has a visible remove button in its top-right corner.
9. Remove a middle photo and confirm only that photo disappears, the count decreases, and the upload control becomes available again.
10. Remove the current EXIF-source photo and confirm date/GPS candidates are recalculated from the remaining photos or cleared when no candidate remains.
11. With no text entered, remove all photos and confirm the `Generate AI Trace` button is disabled because both accepted input types are empty.
12. Enter text while no photos are selected and confirm `Generate AI Trace` is enabled for text-only generation.
13. After removing a photo, select that same file again and confirm it can be added normally.
14. After generating but before saving, remove a photo and confirm it also disappears from the generated draft and is excluded from permanent save.
15. Confirm saved-cloud state does not expose the draft-only remove control.
16. Select 21 photos and confirm only the first 20 are accepted and the interface explains the limit.
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
9. Open `/map` and confirm the place route appears when traces have places.
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

### 10.6 Plan Changes

Until Stripe lands, plan changes are made by writing a `subscriptions` row directly.

1. Insert an `active` `founding_plus` row with a future `current_period_end`; confirm `/api/entitlements` reports 500 traces and 50 generations.
2. Set `current_period_end` to a past date; confirm the plan degrades to Free.
3. Set `status` to `canceled`; confirm the plan degrades to Free while the account keeps read, edit, and delete rights over existing traces.
4. Confirm a degraded account can still open, edit, export, and delete traces it already saved.
