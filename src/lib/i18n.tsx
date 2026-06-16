"use client";

import * as React from "react";
import { LOCALES, type Language } from "./locales";

const LANGUAGE_KEY = "triptrace-lang";

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
};

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>("zh");

  React.useEffect(() => {
    // Hydrate from localStorage after mount (SSR has no window) — this is a one-time
    // sync from an external store, not a derived-state anti-pattern.
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    if (stored === "en" || stored === "zh") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = React.useCallback((lang: Language) => {
    setLanguageState(lang);
    window.localStorage.setItem(LANGUAGE_KEY, lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, []);

  const t = React.useCallback(
    (path: string) => {
      const value = getByPath(LOCALES[language], path);
      return typeof value === "string" ? value : path;
    },
    [language],
  );

  const value = React.useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
