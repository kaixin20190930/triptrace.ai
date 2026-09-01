import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPinned, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Historical Life Atlases",
  description:
    "Explore source-backed maps and timelines of remarkable lives, then create a private Life Atlas of your own.",
  alternates: { canonical: "/explore" },
};

export default function ExplorePage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Historical Atlas
        </p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl font-semibold leading-none sm:text-7xl">
          A life becomes clearer when you can follow where it went.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          We are building carefully sourced maps and timelines of remarkable lives. Every published
          event will distinguish verified facts from editorial narrative.
        </p>

        <section className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
          <article className="bg-card p-7">
            <MapPinned className="h-6 w-6 text-primary" aria-hidden />
            <h2 className="mt-8 font-serif text-2xl font-semibold">The first Atlases are in review</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              We will begin with deceased figures whose journeys are geographically rich and
              supported by reliable English-language sources. Nothing is published straight from AI.
            </p>
          </article>
          <article className="bg-card p-7">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
            <h2 className="mt-8 font-serif text-2xl font-semibold">Your Atlas follows different rules</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Historical pages are public and reviewed. Your personal traces are private by default
              and only become shareable when you explicitly choose.
            </p>
          </article>
        </section>

        <Link
          href="/#capture"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
        >
          Create your Life Atlas
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </main>
    </AppShell>
  );
}
