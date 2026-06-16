"use client";

import { useTheme } from "next-themes";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function Topbar({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-3">
      <div role="group" aria-label="Language switch" className="flex rounded-full border border-border p-0.5">
        <button
          onClick={() => setLanguage("zh")}
          className={`rounded-full px-3 py-1 text-sm transition ${
            language === "zh" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          中
        </button>
        <button
          onClick={() => setLanguage("en")}
          className={`rounded-full px-3 py-1 text-sm transition ${
            language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          EN
        </button>
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="切换主题"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        ◐
      </Button>
      <Button variant="outline" onClick={onOpenAccount} className="hidden sm:inline-flex">
        {t("auth.notSignedIn")}
      </Button>
    </div>
  );
}
