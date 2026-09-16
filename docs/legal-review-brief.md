# Legal Review Brief

Prepared 2026-09-15 for a lawyer reviewing `/privacy` and `/terms` at https://triptrace.ai.

This document is not legal advice and was not written by a lawyer. Its purpose is narrow: to
state exactly what the software does, so that review time goes to judgement rather than to
discovery. Every factual claim below is traceable to code or to a verified test run, and the
sections marked **Needs a decision** are the ones that cannot be answered from the code.

## 1. What the product is

An English-first web application that turns a user's photos and notes into a private, browsable
personal archive: a map, a timeline, and individual entries called traces. AI drafts the prose of a
trace. The user confirms the facts. Traces are private by default and can be shared one at a time
through a revocable link.

Target market is the UK, EU, and United States. The operator is a single individual. There is no
company entity on record in this repository, no registered address, and no published contact
address. See section 8.

Currently live at `https://triptrace.ai`, with no marketing, no paying customers, and no Stripe
account configured. Billing code exists but reports itself unavailable until Stripe is set up.

## 2. Personal data actually stored

Taken from `migrations/0001` through `0012`, which is the complete schema.

| Category | Fields | Source |
| --- | --- | --- |
| Account | email, display name, password as a PBKDF2 hash, created timestamp | user supplies |
| Session | opaque session token, expiry | generated on sign in |
| Trace content | title, story, tags | AI drafts, user edits |
| Trace facts | event date and its precision, place name, named people, latitude and longitude, factual note, a confirmation flag | user supplies or confirms |
| Trace provenance | which AI model drafted the story, or that a local fallback did | generated |
| Photos | image files in object storage, keyed under `users/<user id>/` | user uploads |
| Analytics | event name, a random browser identifier, a session identifier, account id when signed in, timestamp, and a whitelist of coarse properties | generated on interaction |
| Abuse counters | a value derived from the IP address, a hashed random guest identifier, counts, window expiry | generated |
| Entitlements | plan key, usage counters per period | generated |
| Billing | plan, status, renewal date, Stripe customer and subscription ids | Stripe, if the user subscribes |
| Share links | a SHA-256 hash of the link token, a six-character display fragment, expiry, revocation state | generated |

Named people are stored as free text the user typed. They are personal data about third parties
who have not consented, and the user is the one who decided to record them. `/terms` addresses this
as the user's judgement to make. Whether that allocation is adequate is a question for review.

Deliberately not stored: story text, photo contents, precise coordinates, people's names, and
search terms are all excluded from analytics. This is enforced by a property whitelist in
`src/lib/analytics-events.ts` and pinned by unit tests, not merely intended.

Card details never reach the application. Stripe handles them.

## 3. Processors and transfers

| Recipient | What it receives | When |
| --- | --- | --- |
| Cloudflare | everything: application hosting, database, object storage | always |
| OpenAI | the note the user typed, plus a bounded number of representative photos at reduced resolution | only at the moment a draft is requested |
| Stripe | what is needed to take a payment | only if the user subscribes |

There is no analytics vendor, no advertising network, no map tile provider, and no email provider.
The world map is drawn from a file served from our own origin, specifically so that browsing a
private Atlas does not disclose to a third party which part of the world is being viewed.

OpenAI receives no account details, no other traces, and no saved facts. Verified by reading the
single outbound request construction in `src/app/api/generate-memory/route.ts`.

Both Cloudflare and OpenAI may process in the United States. **Needs a decision:** the transfer
mechanism to cite, and whether the current notice's single sentence on this is sufficient.

`/terms` states that user content is not used to train models. For the OpenAI API this rests on
OpenAI's own terms rather than on anything this code enforces. **Needs a decision:** whether that
claim should be qualified, given it depends on a third party's policy.

## 4. Retention, verified

- Traces, photos, and accounts are kept until the user deletes them. There is no inactivity
  expiry. **Needs a decision:** whether an indefinite retention period for an abandoned account is
  defensible, and whether a dormancy policy should exist.
- Deleting a trace removes the database row and the photo files. If object storage refuses a
  delete, the job is queued and retried, so the promise survives a storage failure.
- Analytics rows are deleted after 90 days. Enforced by `src/lib/server/analytics-retention.ts`,
  both on an opportunistic sweep and through an operator endpoint.
- Abuse counters expire within hours.
- Account deletion removes traces, photos, share links, counters, and analytics rows. Verified in
  the deployment smoke test: deletion returns 200 and a subsequent sign-in returns 401.

## 5. Rights machinery that already exists

Not promises, working features, each verified against the live deployment:

- **Export.** Complete JSON, and an archive containing the actual photo files. Available on every
  plan including the free one, deliberately, because data portability is a right rather than a paid
  feature.
- **Correction.** Every confirmed fact stays editable, and editing one clears its confirmation so
  the change is deliberate.
- **Erasure.** Self-service account deletion, requiring the password, irreversible.
- **Sharing withdrawal.** Any share link can be revoked and stops working immediately, photos
  included. Tokens are stored only as hashes, so a database disclosure yields no working links.
- **Analytics opt-out.** A control on the privacy page, plus automatic respect for Global Privacy
  Control and Do Not Track.

## 6. The analytics question, which is the main open risk

How it works, precisely. Analytics is **on by default** and the user opts out. A random identifier
`anon_<uuid>` is written to `localStorage`, and a session identifier to `sessionStorage`. Neither is
created until the first event fires, so a visitor who never interacts has nothing stored. Global
Privacy Control and Do Not Track are honoured before anything is written or sent.

Why it is worth attention. Storing a persistent non-essential identifier on a visitor's device is
the activity ePrivacy Article 5(3) addresses, and the usual reading is that it requires prior
consent for EU and UK visitors. Honouring Global Privacy Control is more than most products do, but
a signal absent is not the same as consent given. Running product analytics on legitimate interest
with an opt-out is common practice and is also the practice regulators have challenged.

**Needs a decision.** Whether to keep opt-out with legitimate interest, or move EU and UK visitors
to opt-in. If opt-in is required, the change is small: the check in `trackEvent` already gates every
write in one place, so the default can be inverted and a consent prompt added without touching any
call site.

Worth weighing: the events are coarse and carry no content, the purpose is to find out whether
people finish creating their first trace, and there is no vendor, no advertising and no profiling.
That is a materially different posture from third-party tracking, and may support a different
answer than the default assumption.

## 7. What the terms do not currently address

Listed as gaps rather than drafted, because each is a judgement call:

- Governing law and jurisdiction. Nothing is stated.
- Limitation of liability. Nothing is stated. The current text says only that there is no uptime
  guarantee and that users should keep their own copies.
- Warranty disclaimer. Nothing in the conventional form.
- Consumer withdrawal rights. EU and UK consumers generally have a fourteen day right to withdraw
  from a distance contract, with specific handling for digital services begun within that period.
  Nothing addresses this, and no Stripe checkout exists yet, so it can be handled before any money
  is taken rather than retrofitted.
- Refunds. No policy stated.
- Tax. Whether prices of $9.99 monthly and $79 annually are inclusive or exclusive of VAT and sales
  tax is not stated, and Stripe Tax is not configured.
- Copyright complaints. Users upload photographs, so a notice and takedown route, and in the United
  States a designated agent, are relevant. Neither exists.
- Suspension and termination by us. Mentioned in one sentence, with no process or appeal.
- Age. Both documents state sixteen. The threshold varies by member state and is thirteen under US
  COPPA. There is no age verification beyond the statement, and nothing detects a child's account.

## 8. The one blocking gap

Both documents tell the reader to "contact the address published on the site". **No contact address
exists anywhere in the application.** Searching the entire source for `mailto:`, `@triptrace`, and
`support@` returns nothing.

This is the first thing to fix, and it needs two facts that only the operator can supply:

1. Who the controller is. A named individual, or a company, and in which country. This determines
   the notice's controller identity, the lead supervisory authority, and the governing law clause.
2. A working contact address for privacy requests. Cloudflare Email Routing can forward
   `privacy@triptrace.ai` to a personal inbox at no cost, and the domain already sits in the
   account.

Until both exist, the privacy notice cannot be complete, whatever its wording.

## 9. What has been done to the pages without legal input

Changes limited to accuracy and to disclosure items whose content is factual rather than a
judgement: the right to complain to a supervisory authority, the absence of automated
decision-making, the absence of any inactivity-based deletion, a statement of which purpose each
category of processing serves, and the international transfer position.

The notice at the top of both pages saying they have not had legal review has been left in place. It
should not be removed by anyone other than the lawyer who performs the review.
