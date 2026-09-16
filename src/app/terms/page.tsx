import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_CONTACT_EMAIL } from "@/lib/legal";

/**
 * Terms of use.
 *
 * Same principle as the privacy notice: describe the actual arrangement plainly, including
 * the parts that are not flattering, and do not pretend to be reviewed legal wording.
 */
export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using TripTrace.ai, including plans, content ownership, and cancellation.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "15 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Terms</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold">Terms of use</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Last updated {LAST_UPDATED}. These terms describe the arrangement as the product actually
          works today. They have not yet been reviewed by a lawyer.
        </p>
      </header>

      <Section title="Your content stays yours">
        <p>
          You keep every right to the photos and words you put into TripTrace.ai. We claim no
          ownership. We store and process them only to run the service for you: to show you your
          Atlas, to draft a story when you ask, and to serve a trace to someone you gave a link to.
        </p>
        <p>
          We do not use your content to train models, and we do not make it public. Your traces are
          private by default and become reachable to anyone else only through a share link you
          create for a single trace, which you can revoke.
        </p>
      </Section>

      <Section title="What AI does and does not do">
        <p>
          AI drafts wording. It does not establish facts. A draft is a starting point you edit, and a
          trace cannot be saved until you confirm its date, place, and people yourself.
        </p>
        <p>
          AI output can be wrong, bland, or oddly worded. Treat a draft as a draft. If the provider
          is unavailable you get a clearly labelled local fallback instead, never something dressed
          up as AI output.
        </p>
      </Section>

      <Section title="Plans and limits">
        <p>
          Guests can create one AI draft and cannot save permanently. The free plan keeps a small
          number of traces with a monthly AI allowance. Founding Plus raises both. Current numbers
          and your usage are always visible on{" "}
          <Link href="/plan" className="text-primary underline-offset-4 hover:underline">
            Plan and usage
          </Link>
          .
        </p>
        <p>
          Limits are enforced on our servers. A failed AI request does not use up an allowance, and
          deleting a trace frees its slot immediately.
        </p>
        <p>
          Founding Plus is early-supporter pricing. It does not lock the price permanently: pricing
          may change in future with notice before it affects you.
        </p>
      </Section>

      <Section title="Payment and cancellation">
        <p>
          Subscriptions are billed through Stripe, monthly or annually, and renew until cancelled.
          You can cancel yourself at any time from the billing portal. Cancelling takes effect at the
          end of the period you have already paid for.
        </p>
        <p>
          After cancelling, your account returns to the free allowance. You keep full access to read,
          export, and delete everything you already saved. We do not hold your memories hostage to
          get you to resubscribe.
        </p>
        <p>
          To delete your account while subscribed, cancel first. That is deliberate: it prevents an
          account being billed after it no longer exists.
        </p>
      </Section>

      <Section title="What we ask of you">
        <ul className="list-disc space-y-2 pl-5">
          <li>Upload only content you have the right to upload.</li>
          <li>Be considerate about other people. If you name someone or share a trace featuring them, that is your judgement to make, so make it thoughtfully.</li>
          <li>Do not use the service for anything unlawful, or to store content that would harm someone.</li>
          <li>Do not attempt to reach other people&apos;s traces or media, and do not work around plan limits.</li>
          <li>You must be at least 16 to use TripTrace.ai.</li>
        </ul>
      </Section>

      <Section title="What we do not promise">
        <p>
          This is an early product run by a very small team. There is no uptime guarantee, features
          may change, and bugs happen. Keep your own copies of anything you would be upset to lose;
          the export exists precisely so that is easy, and it is free on every plan.
        </p>
        <p>
          We may suspend an account that is being used to attack the service or to harm someone. If
          we ever have to shut the service down, we will give notice and time to export.
        </p>
      </Section>

      <Section title="What these terms do not yet cover">
        <p>
          Rather than let you assume otherwise: these terms say nothing about governing law, nothing
          about limiting our liability, and nothing about refunds. Most services state all three. We
          have not, because stating them properly takes a lawyer and we would rather leave a visible
          gap than write something that reads convincingly and means little.
        </p>
        <p>
          Nothing is being sold yet, so the parts that matter most once money changes hands, including
          the withdrawal rights EU and UK consumers have when buying online, will be settled before
          any payment is possible rather than afterwards.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If these terms change, the date above changes. How we handle your data is described in the{" "}
          <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
            privacy notice
          </Link>
          .
        </p>
        {PRIVACY_CONTACT_EMAIL ? (
          <p>
            For anything to do with your account or your content, write to{" "}
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>
            .
          </p>
        ) : (
          <p>
            We do not yet publish a contact address. You can export everything and delete your account
            yourself from{" "}
            <Link href="/plan" className="text-primary underline-offset-4 hover:underline">
              Plan and usage
            </Link>
            , which covers most of what you might otherwise need to ask us for. For anything else,
            there is currently no route, and saying so is better than listing an address that nobody
            reads.
          </p>
        )}
      </Section>
    </main>
  );
}
