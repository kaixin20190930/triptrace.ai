# TripTrace Trace Graph V1

Last updated: 2026-07-28 Asia/Shanghai

Status: Approved design for Paid Public Alpha implementation

## 1. Design Goal

Trace Graph V1 extends the existing production schema instead of replacing it.

It must support:

- Personal text and photo traces
- Factual fields that the user can confirm
- AI narrative stored separately from facts
- Private-by-default ownership
- Revocable selected sharing
- Map and timeline synchronization
- Subscription entitlements and usage limits
- Source-backed historical traces
- A future move from 2D to 3D without changing the event model

## 2. Core Invariants

1. `created_at` is the database creation time, not the life-event time.
2. `event_at` is the event time shown on the Life Atlas.
3. AI may propose facts, but confirmed fact fields are changed only by the user or an editor.
4. `story` is narrative; `factual_summary` is factual.
5. Personal records are private unless the owner takes an explicit sharing action.
6. A private share link does not make a trace public or indexable.
7. Historical traces cannot be published without a source and review state.
8. R2 object keys are storage identifiers, not authorization tokens.
9. Billing UI never grants access by itself; the server entitlement is authoritative.

## 3. Personal Atlas Model

### 3.1 `atlases`

| Column | Type | Rule |
|---|---|---|
| `id` | TEXT PK | Stable `atl_` ID |
| `owner_user_id` | TEXT | Required for personal Atlas |
| `kind` | TEXT | `personal` or future supported kind |
| `title` | TEXT | Default `My Life Atlas` |
| `visibility` | TEXT | Default `private` |
| `locale` | TEXT | Default `en` |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

Paid Public Alpha creates one personal Atlas per user. The table prevents the one-Atlas assumption from becoming a permanent schema restriction.

### 3.2 Existing `memories` table extensions

The existing table remains the personal trace table during the launch window.

| Column | Type | Rule |
|---|---|---|
| `atlas_id` | TEXT | Personal Atlas foreign key |
| `event_at` | TEXT | User-confirmable ISO date/time |
| `event_end_at` | TEXT | Optional |
| `time_precision` | TEXT | `exact`, `day`, `month`, `year`, `approximate`, `unknown` |
| `latitude` | REAL | Optional |
| `longitude` | REAL | Optional |
| `location_precision` | TEXT | `exact`, `city`, `region`, `approximate`, `unknown` |
| `people_json` | TEXT | JSON array of user-entered names |
| `factual_summary` | TEXT | User-confirmed factual account |
| `story` | TEXT | Editable narrative |
| `ai_provider` | TEXT | Example: `openai` |
| `ai_model` | TEXT | Configured model at generation time |
| `ai_generated_at` | TEXT | ISO timestamp |
| `facts_confirmed_at` | TEXT | Null until confirmation |
| `updated_at` | TEXT | ISO timestamp |
| `locale` | TEXT | Narrative language, default `en` |
| `is_public` | INTEGER | Compatibility field; database default must become `0` |

Compatibility:

- Existing `place` remains the display label.
- Existing `title`, `mood`, `tags_json`, and media columns remain.
- Existing records use `created_at` as the event-time fallback until edited.
- Existing explicit public records remain public.

## 4. Media Model

### 4.1 `media_assets`

| Column | Type | Rule |
|---|---|---|
| `id` | TEXT PK | Stable `med_` ID |
| `owner_user_id` | TEXT | Null only for temporary anonymous processing |
| `memory_id` | TEXT | Null until attached |
| `r2_key` | TEXT UNIQUE | Storage key |
| `status` | TEXT | `temporary`, `active`, `deleted` |
| `content_type` | TEXT | Allowlisted image type |
| `size_bytes` | INTEGER | Required |
| `width` | INTEGER | Prepared image width |
| `height` | INTEGER | Prepared image height |
| `captured_at` | TEXT | EXIF-derived, user-correctable through trace |
| `latitude` | REAL | EXIF-derived |
| `longitude` | REAL | EXIF-derived |
| `expires_at` | TEXT | Required for temporary objects |
| `created_at` | TEXT | ISO timestamp |

Access rule:

- Owner session may read active private media.
- A valid unrevoked share token may read media attached to its trace.
- Published public traces may read attached public media.
- Object-key knowledge alone grants nothing.

## 5. Sharing Model

### 5.1 `share_links`

| Column | Type | Rule |
|---|---|---|
| `id` | TEXT PK | Stable `shr_` ID |
| `memory_id` | TEXT | Required |
| `owner_user_id` | TEXT | Required |
| `token_hash` | TEXT UNIQUE | Never store the raw token |
| `status` | TEXT | `active` or `revoked` |
| `allow_indexing` | INTEGER | Default `0` |
| `expires_at` | TEXT | Optional |
| `created_at` | TEXT | ISO timestamp |
| `revoked_at` | TEXT | Optional |

Paid Public Alpha links are `noindex` by default.

## 6. Billing and Entitlements

### 6.1 `subscriptions`

| Column | Type | Rule |
|---|---|---|
| `id` | TEXT PK | Internal stable ID |
| `user_id` | TEXT | Required |
| `provider` | TEXT | `stripe` |
| `provider_customer_id` | TEXT UNIQUE | Stripe customer |
| `provider_subscription_id` | TEXT UNIQUE | Nullable before subscription |
| `plan_key` | TEXT | `free`, `founding_plus_monthly`, `founding_plus_annual` |
| `status` | TEXT | Provider-normalized status |
| `current_period_end` | TEXT | Optional |
| `cancel_at_period_end` | INTEGER | Boolean |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### 6.2 `billing_events`

Stores verified webhook IDs for idempotency and audit.

Required fields:

- Provider event ID
- Event type
- Processing status
- Received timestamp
- Processed timestamp
- Non-sensitive error summary

### 6.3 `usage_counters`

| Column | Type | Rule |
|---|---|---|
| `user_id` | TEXT | Required |
| `period_key` | TEXT | Example `2026-08` |
| `metric_key` | TEXT | `ai_generation`, `trace_created`, `media_bytes` |
| `count` | INTEGER | Server-maintained |
| `updated_at` | TEXT | ISO timestamp |

Primary key:

`(user_id, period_key, metric_key)`

### 6.4 Launch entitlements

| Plan | Permanent traces | Monthly AI generation | Images per trace |
|---|---:|---:|---:|
| Guest | 0 | 1 temporary demo | 20 |
| Free | 3 | Limited launch allowance | 20 |
| Founding Plus | 500 | 50 | 20 |

The Free monthly AI allowance is configured server-side and can be adjusted without a migration. Initial implementation recommendation: 5.

## 7. First-party Analytics

### 7.1 `analytics_events`

| Column | Type | Rule |
|---|---|---|
| `id` | TEXT PK | Stable event ID |
| `event_name` | TEXT | Allowlisted stable name |
| `anonymous_id` | TEXT | Rotatable pseudonymous ID |
| `user_id` | TEXT | Optional |
| `session_id` | TEXT | Optional |
| `properties_json` | TEXT | Allowlisted non-content properties |
| `occurred_at` | TEXT | Client event time |
| `received_at` | TEXT | Server time |

Do not store:

- Memory story text
- Photo content
- Exact private coordinates
- Password, token, cookie, or payment data

## 8. Historical Atlas Model

### 8.1 `historical_people`

Required fields:

- ID
- Slug
- Display name
- Birth/death dates with precision
- Short factual introduction
- Editorial state
- Locale
- SEO title and description
- Published and revised timestamps

### 8.2 `historical_traces`

Required fields:

- ID
- Person ID
- Sequence
- Start/end time
- Time precision
- Place label and coordinates
- Location precision
- Factual summary
- Editorial narrative
- Confidence
- Review state
- Created and updated timestamps

Confidence:

- `exact`
- `well_supported`
- `approximate`
- `disputed`
- `legendary`
- `unknown`

### 8.3 `historical_sources`

Required fields:

- ID
- URL
- Title
- Publisher
- Author
- Publication date
- Accessed date
- Source type
- Rights/license note

### 8.4 `historical_trace_sources`

Join fields:

- Historical trace ID
- Source ID
- Source note
- Supports/contradicts relationship

Publishing rule:

Every published historical trace has at least one source and a completed editorial review.

## 9. API Contracts

### Personal generation

Input:

- Optional text
- Prepared representative images
- Extracted candidate facts
- Desired locale

Output:

- Proposed title
- Proposed factual summary
- Proposed narrative
- Proposed tags
- AI provenance
- No silent persistence

### Personal save

Requires:

- Authenticated user
- Server entitlement check
- Confirmed factual fields
- Explicit private default

### Public history

Returns only:

- Published historical people
- Published historical traces
- Reviewed sources
- Licensed or approved media

## 10. Deletion Rules

Deleting a trace removes:

1. Trace record
2. Trace/media relations
3. R2 objects not referenced elsewhere
4. Share links
5. Comments on legacy public traces

Deleting an account removes:

1. Sessions
2. Personal traces and Atlas records
3. Media and share links
4. Subscription references retained only as legally required non-content billing records
5. Persona/profile data
6. Direct user identifiers from product analytics where technically feasible

Historical editorial records are not personal-account records and follow a separate editorial retention policy.
