"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useLanguage } from "@/lib/i18n";

export default function Home() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <section aria-label="产品状态" className="mb-10">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ui.privateBeta")}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">{t("hero.title")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("hero.lead")}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="#capture"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            {t("hero.start")}
          </a>
          <a href="#community" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium">
            {t("hero.public")}
          </a>
        </div>
      </section>

      <section aria-label="使用流程" className="mb-10 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("howItWorks.eyebrow")}
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          {(["step1", "step2", "step3"] as const).map((step, i) => (
            <div key={step} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <strong className="block text-sm">{t(`howItWorks.${step}Title`)}</strong>
                <p className="mt-1 text-sm text-muted-foreground">{t(`howItWorks.${step}Body`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="capture"
        className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground"
      >
        Capture 模块将在 Session 2 迁移（流式生成 + 照片上传）
      </section>
    </AppShell>
  );
}
