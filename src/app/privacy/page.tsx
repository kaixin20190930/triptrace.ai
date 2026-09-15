import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsPreference } from "@/components/legal/analytics-preference";

/**
 * Privacy notice.
 *
 * Written to match what the code actually does, field by field, rather than to sound like a
 * privacy policy. Accuracy is the part that can be guaranteed here; wording that satisfies a
 * regulator is not, and the notice says so at the top until it has had legal review.
 *
 * If product behaviour changes, this page changes with it. Anything described here is
 * traceable to code: the data list matches the schema in `migrations/`, the third parties
 * match the only outbound calls the app makes, and the retention period matches
 * `src/lib/server/analytics-retention.ts`.
 */
export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What TripTrace.ai stores, who processes it, how long it is kept, and how to export or erase it.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "2 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Privacy</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold">What we store, and what we do not</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Last updated {LAST_UPDATED}. This notice describes how the product actually behaves
          today. It has not yet been reviewed by a lawyer, so treat it as an accurate technical
          description rather than as finished legal wording.
        </p>
      </header>

      <Section title="The short version">
        <ul className="list-disc space-y-2 pl-5">
          <li>Your traces are private by default. Nothing you save is public unless you create a share link for one trace.</li>
          <li>We do not sell your data, run advertising, or embed third-party trackers.</li>
          <li>The map is drawn from a file we host, so browsing your Atlas sends no request to any map provider.</li>
          <li>You can export everything, including the photo files, and you can delete your account outright.</li>
          <li>AI drafts the wording of a story. It never fills in or changes a date, a place, or a person.</li>
        </ul>
      </Section>

      <Section title="What we store">
        <p className="font-medium text-foreground">Your account</p>
        <p>
          Your email address, a display name, and your password stored only as a PBKDF2 hash. We
          cannot read your password.
        </p>
        <p className="font-medium text-foreground">Your traces</p>
        <p>
          The title, story, and tags drafted with AI and edited by you, and the facts you confirmed:
          the event date and its precision, place name, the people you named, coordinates if you
          supplied or accepted them, and your factual note. We also record which AI model drafted a
          story, so authorship stays attributable.
        </p>
        <p className="font-medium text-foreground">Your photos</p>
        <p>
          Photos you save while signed in are stored in Cloudflare R2 and are readable only by you,
          or through a share link you created. Photos are resized in your browser before upload.
        </p>
        <p className="font-medium text-foreground">Product analytics</p>
        <p>
          Coarse events about how the product is used: which step you reached, counts, durations,
          and booleans. We deliberately do not store story text, photo contents, exact coordinates,
          people&apos;s names, or search terms. Events are attached to a random identifier stored in
          your browser, and to your account id when you are signed in.
        </p>
        <p className="font-medium text-foreground">Abuse prevention</p>
        <p>
          Short-lived counters keyed to a value derived from your IP address, used to stop one
          visitor from exhausting shared resources. For the single free guest draft we also use a
          random identifier stored in your browser, hashed before storage.
        </p>
        <p className="font-medium text-foreground">Billing</p>
        <p>
          If you subscribe, we store your plan, its status, the renewal date, and Stripe&apos;s
          customer and subscription identifiers. Card details go to Stripe and never reach us.
        </p>
        <p className="font-medium text-foreground">Share links</p>
        <p>
          A link is stored as a hash of its token, not the token itself, along with a six-character
          fragment so you can tell your links apart. That is why a link URL is shown to you only
          once.
        </p>
      </Section>

      <Section title="Who else processes it">
        <p>
          <strong className="text-foreground">Cloudflare</strong> hosts the application, the
          database, and the photo storage.
        </p>
        <p>
          <strong className="text-foreground">OpenAI</strong> receives the note you type and a
          bounded number of representative photos, at reduced resolution, at the moment you ask for
          a draft. It receives nothing at any other time, and it is not sent your account details,
          your other traces, or your saved facts.
        </p>
        <p>
          <strong className="text-foreground">Stripe</strong> receives what it needs to take a
          payment, and only if you choose to subscribe.
        </p>
        <p>
          There is no analytics vendor, no advertising network, no map tile provider, and no email
          provider. Both Cloudflare and OpenAI may process data in the United States.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Traces, photos, and your account are kept until you delete them. Deleting a trace removes
          its database record immediately and its photo files as well; if storage refuses a delete,
          the job is queued and retried until it succeeds.
        </p>
        <p>
          Product analytics rows are kept for at most 90 days and then deleted. That limit is
          enforced in the product, not merely promised here.
        </p>
        <p>Abuse-prevention counters expire within hours.</p>
      </Section>

      <Section title="What you can do">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Export everything.</strong> A complete JSON file, or
            an archive that also contains your photo files, from{" "}
            <Link href="/plan" className="text-primary underline-offset-4 hover:underline">
              Plan and usage
            </Link>
            . Export is available on every plan, including the free one.
          </li>
          <li>
            <strong className="text-foreground">Correct anything.</strong> Every confirmed fact stays
            editable, and editing a fact clears its confirmation so the change is deliberate.
          </li>
          <li>
            <strong className="text-foreground">Delete your account.</strong> This removes your
            traces, photos, share links, counters, and analytics rows, and cannot be undone.
          </li>
          <li>
            <strong className="text-foreground">Revoke sharing.</strong> Any share link can be
            revoked and stops working at once, photos included.
          </li>
          <li>
            <strong className="text-foreground">Turn off analytics.</strong> The control is below.
          </li>
        </ul>
        <p>
          If you are in the UK or EU, these cover access, rectification, erasure, and portability. If
          you are in California, they cover access, deletion, and correction. We do not sell personal
          information, so there is nothing to opt out of on that front.
        </p>
      </Section>

      <Section title="Analytics preference">
        <AnalyticsPreference />
      </Section>

      <Section title="AI and your facts">
        <p>
          AI is used for one job: drafting the wording of a story from what you provide. The
          separation is enforced in the data model, not only in the interface. AI output can only
          ever write the title, story, and tags. The date, place, people, coordinates, and factual
          note are yours, and a trace cannot be saved until you confirm them.
        </p>
        <p>
          A draft is labelled with the model that wrote it. If AI is unavailable, you get a clearly
          labelled local fallback rather than something pretending to be AI output.
        </p>
      </Section>

      <Section title="Children">
        <p>
          TripTrace.ai is not intended for anyone under 16, and we do not knowingly collect their
          information. If you believe a child has created an account, contact us and we will delete
          it.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this notice changes in a way that affects you, the date above changes and the change is
          recorded in the project history. For any privacy request, including access or erasure,
          contact the address published on the site. You can also exercise access and erasure
          yourself, immediately, from{" "}
          <Link href="/plan" className="text-primary underline-offset-4 hover:underline">
            Plan and usage
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}
