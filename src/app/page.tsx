"use client";

import { AppShell } from "@/components/layout/app-shell";
import { CapturePanel } from "@/components/capture/capture-panel";
import { trackEvent } from "@/lib/analytics";
import { useLanguage } from "@/lib/i18n";

export default function Home() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <section aria-label="TripTrace AI Life Atlas" className="relative mb-12 overflow-hidden rounded-[2rem] border border-border bg-card px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ui.privateBeta")}
        </p>
        <h1 className="relative mt-3 max-w-4xl font-serif text-5xl font-semibold leading-[0.95] tracking-[-0.035em] sm:text-7xl">
          {t("hero.title")}
        </h1>
        <p className="relative mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {t("hero.lead")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="#capture"
            onClick={() => trackEvent("personal_cta_click", { source: "home_hero" })}
            className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:-translate-y-0.5"
          >
            {t("hero.start")}
          </a>
        </div>
        <p className="relative mt-8 font-serif text-lg italic text-muted-foreground">
          Every trip leaves traces. Every trace tells a story.
        </p>
      </section>

      <section aria-label="How TripTrace works" className="mb-12">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("howItWorks.eyebrow")}
        </p>
        <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {(["step1", "step2", "step3"] as const).map((step, i) => (
            <div key={step} className="bg-card p-6">
              <span className="font-mono text-xs text-primary">0{i + 1}</span>
              <strong className="mt-8 block font-serif text-xl">{t(`howItWorks.${step}Title`)}</strong>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`howItWorks.${step}Body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="capture">
        <CapturePanel />
      </section>
    </AppShell>
  );
}
