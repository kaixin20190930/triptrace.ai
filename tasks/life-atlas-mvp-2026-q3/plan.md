# Life Atlas MVP Implementation Plan

Last updated: 2026-07-28 Asia/Shanghai

Roadmap reference: `docs/overseas-life-atlas-commercial-roadmap.md`

Current status source:

> Use `tasks/life-atlas-mvp-2026-q3/progress.md` as the canonical implementation status.
> This file defines target milestones and acceptance criteria; its status tables are planning baselines unless `progress.md` says otherwise.

Paid Public Alpha references:

- `tasks/life-atlas-mvp-2026-q3/audit-2026-07-28.md`
- `tasks/life-atlas-mvp-2026-q3/schedule-2026-07-29-to-08-15.md`

The active strategy is a clean Next.js rebuild. August 15 is a Public Alpha readiness
checkpoint, not permission to ship an unsafe or incomplete paid product. Billing follows
only after the private create-confirm-save-revisit loop passes its quality gates.

## Status Values

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`

Every completed task must record:

- Acceptance evidence
- Metrics or analytics event evidence
- Test evidence
- Documentation changes
- Deployment URL

Every new user-facing feature must update `docs/manual-testing-guide.md`.

## Milestone M0: Product and Data Foundation

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M0-001 | DONE | Freeze final MVP scope | Public history, personal Atlas, and editorial admin scope are approved; exclusions are recorded |
| M0-002 | DONE | Define Trace Graph schema | Personal Atlas, trace facts, media, sharing, billing, analytics, and historical source schemas are documented in `docs/trace-graph-v1.md` |
| M0-003 | DONE | Separate fact and narrative fields | AI narrative cannot overwrite factual fields or source records |
| M0-004 | DONE | Define public/private permission model | Private personal traces cannot appear in public queries, sitemap, feeds, or shared caches |
| M0-005 | DONE | Define historical confidence model | Exact, well-supported, approximate, disputed, legendary, and unknown states are documented |
| M0-006 | DONE | Define analytics event dictionary | Every acquisition, engagement, conversion, retention, and billing event has a stable name |
| M0-007 | DONE | Review brand collision risk | TripTrace naming, app-store availability, and trademark next action are recorded |
| M0-008 | DONE | Select 2D map implementation | MapLibre/OpenFreeMap is the target; no legacy renderer compatibility is required |

## Milestone M1: Historical SEO Acquisition Engine

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M1-001 | NOT_STARTED | Create English historical route architecture | Canonical person routes and related person/place routes are defined |
| M1-002 | NOT_STARTED | Build synchronized 2D map and timeline | Selecting either a map point or timeline event updates the other |
| M1-003 | NOT_STARTED | Build playback controls | Play, pause, previous, next, and timeline scrub work on desktop and mobile |
| M1-004 | NOT_STARTED | Build historical trace card | Time, place, factual event, media, source, and confidence are visible |
| M1-005 | NOT_STARTED | Build source panel | Source title, publisher, author, date, URL, and note are displayed |
| M1-006 | NOT_STARTED | Build historical CSV/JSON import | A reviewed import creates draft traces without publishing automatically |
| M1-007 | NOT_STARTED | Build editorial review states | Draft, review, published, revised, and unpublished states work |
| M1-008 | NOT_STARTED | Build SEO metadata generator | Title, description, canonical, OG, Article/Person/Breadcrumb data, and sitemap entry are produced |
| M1-009 | NOT_STARTED | Publish historical prototype 1 | One high-spatiality historical life is reviewed and deployed |
| M1-010 | NOT_STARTED | Publish historical prototypes 2-3 | Two additional reviewed Atlases establish a reusable content pattern |
| M1-011 | NOT_STARTED | Add related content graph | Every historical page links to relevant people, places, periods, or journeys |
| M1-012 | NOT_STARTED | Add personal conversion CTA | CTA context matches the historical page and opens the personal demo |

## Milestone M2: Personal Activation MVP

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M2-001 | NOT_STARTED | Build no-account personal demo | A visitor can create one temporary Atlas without signing up |
| M2-002 | NOT_STARTED | Import 3-20 photos | Import handles valid images, rejects invalid files, and displays progress |
| M2-003 | NOT_STARTED | Extract EXIF time and location | Available EXIF fields populate factual trace fields |
| M2-004 | IN_PROGRESS | Cluster photos into traces | Grouping, merge, skip, and suggested-fact prefill are implemented and covered by 49 unit checks; browser QA in section 2.1 of the manual guide is outstanding, and the review queue is not yet persisted across a refresh |
| M2-005 | NOT_STARTED | Build factual correction editor | Time, place, people, event type, and summary can be corrected |
| M2-006 | NOT_STARTED | Generate AI story separately | AI output writes only narrative fields and records model/source metadata |
| M2-007 | NOT_STARTED | Build personal 2D Atlas | Personal traces render on the shared synchronized map and timeline |
| M2-008 | NOT_STARTED | Sign up to save | Demo data is preserved when the visitor creates an account |
| M2-009 | NOT_STARTED | Enforce private-by-default | New personal Atlases and traces are private unless explicitly shared |
| M2-010 | NOT_STARTED | Add first-Atlas activation analytics | Demo start, import, correction, generation, completion, sign-up, and save events are recorded |

## Milestone M3: Retention and Trust

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M3-001 | NOT_STARTED | Search personal traces | Search supports keyword, place, person, and year |
| M3-002 | NOT_STARTED | Add Atlas filters | Year, place, person, and trace type filters work together |
| M3-003 | IN_PROGRESS | Add memory resurfacing | Pure selection over saved traces with six widening rules, a stated reason per card, and no generation or writes of any kind; 35 unit checks pass. Browser QA in section 9.6 is outstanding |
| M3-004 | NOT_STARTED | Add revisit email | Users can opt in and unsubscribe; links open the correct trace |
| M3-005 | IN_PROGRESS | Add selected-trace sharing | Per-trace links with hashed tokens, an allowlisted public payload, blurred coordinates, and position-addressed photos; 89 automated checks pass. Browser QA in section 9.5 is outstanding |
| M3-006 | IN_PROGRESS | Add share-link revocation | Revocation is immediate for both story and photos, is auditable, and happens automatically on trace or account deletion; covered by the same checks. Browser QA outstanding |
| M3-007 | IN_PROGRESS | Add digital export | Complete JSON export and a ZIP archive containing the photos are implemented and covered by 50 checks; the per-trace poster is the existing media-ready format. Browser QA in section 9.4.1 is outstanding |
| M3-008 | IN_PROGRESS | Add complete deletion | Trace, media, share-link, and account deletion are all implemented and verified, including password re-entry, an active-subscription guard, and a post-deletion database sweep. Browser QA in sections 9.4.2 and 9.5.3 is outstanding |
| M3-009 | NOT_STARTED | Add GDPR/CCPA-facing controls | Consent, export, deletion, privacy notice, and AI disclosure are available |

## Milestone M4: Commercial MVP

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M4-001 | NOT_STARTED | Define Free and Plus entitlements | Limits are enforced server-side and documented |
| M4-002 | NOT_STARTED | Add subscription billing | Monthly and annual subscriptions work in test and production modes |
| M4-003 | NOT_STARTED | Add entitlement service | Billing status controls storage, AI, search, replay, and export access |
| M4-004 | NOT_STARTED | Add contextual upgrade surfaces | Upgrade prompts appear only after a user reaches a meaningful limit |
| M4-005 | NOT_STARTED | Add billing analytics | Paywall, checkout, purchase, renewal, cancellation, and failure events are recorded |
| M4-006 | NOT_STARTED | Add cancellation and data guarantees | Cancellation does not remove access to export or account deletion |
| M4-007 | NOT_STARTED | Validate unit economics | AI, storage, map, and bandwidth cost per active user are measured |

## Milestone M5: Premium Digital Replay

This milestone remains blocked until M3 retention gates pass.

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M5-001 | BLOCKED | Validate demand for 3D replay | At least 10% of retained users request or attempt richer replay |
| M5-002 | BLOCKED | Prototype 3D terrain replay | Prototype works on target desktop and mobile devices |
| M5-003 | BLOCKED | Measure 3D map cost | Cost per replay and per active paid user is documented |
| M5-004 | BLOCKED | Add cinematic digital export | A replay can be exported digitally without physical fulfillment |

## Milestone M6: Creator and Institution

This milestone is outside the final personal MVP.

| ID | Status | Task | Acceptance criteria |
|---|---|---|---|
| M6-001 | BLOCKED | Validate creator demand | At least 10 qualified creators request an authoring workflow |
| M6-002 | BLOCKED | Validate institutional demand | At least 3 qualified organizations request a pilot |
| M6-003 | BLOCKED | Build public Atlas authoring | Publishing supports sources, review, embeds, and analytics |
| M6-004 | BLOCKED | Add organization workspaces | Roles, billing, permissions, and offboarding are supported |

## Stage Metrics

| Stage | Metric | Gate |
|---|---|---|
| SEO | Indexed reviewed historical pages | At least 80% after crawl time |
| History engagement | Map or timeline interaction | At least 20% of engaged visitors |
| History conversion | Personal CTA click | Initial target 3-5% |
| Demo | Demo completion | At least 40% of starters |
| Activation | Sign up to save | At least 20% of demo completers |
| Retention | Second trace within 7 days | At least 25% of activated users |
| Retention | D7 activated-user retention | At least 20% |
| Revisit | Old-trace revisit within 30 days | At least 20% |
| Revenue | Free-to-paid conversion | 2-4% |
| Revenue | Paid monthly churn | Below 5% |
| Economics | Gross margin | At least 75% |

## Analytics Event Dictionary

Initial required events:

- `history_page_view`
- `history_map_interaction`
- `history_timeline_play`
- `history_trace_open`
- `history_source_open`
- `history_related_click`
- `personal_cta_click`
- `personal_demo_start`
- `personal_photo_import`
- `personal_trace_corrected`
- `personal_story_generated`
- `personal_demo_complete`
- `signup_started`
- `signup_completed`
- `first_atlas_saved`
- `second_trace_created`
- `old_trace_revisited`
- `personal_search_used`
- `trace_shared`
- `share_link_revoked`
- `export_completed`
- `paywall_viewed`
- `checkout_started`
- `subscription_started`
- `subscription_cancelled`

## Definition of Done

A task is not `DONE` until:

1. Acceptance criteria pass.
2. Automated or manual tests pass.
3. `docs/manual-testing-guide.md` is updated for user-facing behavior.
4. Analytics events are verified where applicable.
5. Privacy and permission impact is reviewed.
6. Deployment evidence is recorded in `progress.md`.
