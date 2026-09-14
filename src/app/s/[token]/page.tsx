import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Sparkles, Users } from "lucide-react";
import { requireDb } from "@/lib/server/cf";
import { recordShareView, resolveShareToken, toSharedTrace } from "@/lib/server/share-links";

export const dynamic = "force-dynamic";

/**
 * A shared trace must never enter search results. The owner shared it with the people they
 * sent the link to, not with the web.
 */
export const metadata: Metadata = {
  title: "A shared trace",
  robots: { index: false, follow: false, nocache: true },
};

function formatDate(value: string | null, precision: string) {
  if (!value || precision === "unknown") return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function SharedTracePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await requireDb();
  const resolved = await resolveShareToken(db, token);

  // Unknown, revoked, and expired all render the same not-found page, so the page cannot be
  // used to tell one from another.
  if (!resolved) notFound();

  await recordShareView(db, resolved.link.id);
  const trace = toSharedTrace(resolved, token);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          A trace shared with you
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold">{trace.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Shared by {trace.sharedBy}. Only this one trace is visible through this link, and the
          person who shared it can revoke it at any time.
        </p>
      </header>

      {trace.photoUrls.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {trace.photoUrls.map((url, index) => (
            <div key={url} className="overflow-hidden rounded-2xl border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Shared photo ${index + 1}`}
                className="h-full w-full object-cover"
                loading={index === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
            {formatDate(trace.eventAt, trace.datePrecision)}
          </span>
          {trace.place && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" aria-hidden />
              {trace.place}
            </span>
          )}
          {trace.people.length > 0 && (
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              {trace.people.join(", ")}
            </span>
          )}
        </div>

        <p className="mt-5 whitespace-pre-line leading-7">{trace.story}</p>

        {trace.factualSummary && (
          <div className="mt-5 rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              What actually happened
            </p>
            <p className="mt-1 text-sm leading-6">{trace.factualSummary}</p>
          </div>
        )}

        {trace.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {trace.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-accent/30 px-3 py-1 text-xs font-medium">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {trace.ai.source === "openai" && (
          <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            The story was drafted with AI{trace.ai.model ? ` (${trace.ai.model})` : ""} and the facts
            above were confirmed by the person who shared it.
          </p>
        )}

        {trace.approximateLatitude !== null && trace.approximateLongitude !== null && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Near {trace.approximateLatitude.toFixed(2)}, {trace.approximateLongitude.toFixed(2)}{" "}
            <span className="font-sans">
              (approximate to about {trace.coordinatePrecisionKm} km, so a shared memory does not
              reveal an address)
            </span>
          </p>
        )}
      </section>

      <footer className="rounded-2xl border border-border bg-card p-6">
        <p className="font-serif text-2xl font-semibold">Every trip leaves traces.</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          TripTrace turns your own photos and notes into a private map of your life. Your traces
          stay private unless you choose to share one, exactly like this.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
        >
          Create your own Life Atlas
        </Link>
      </footer>
    </main>
  );
}
