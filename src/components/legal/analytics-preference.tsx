"use client";

/**
 * Analytics opt-out control.
 *
 * The suppression logic already existed in `src/lib/analytics.ts` but had no interface, so a
 * documented choice was not actually a choice anyone could make. This exposes it.
 *
 * Deliberately not instrumented. Recording an event at the moment someone asks not to be
 * recorded would be exactly the behaviour the control exists to prevent.
 */

import * as React from "react";
import { Check, ShieldCheck } from "lucide-react";

const ANALYTICS_DISABLED_KEY = "triptrace:analytics-disabled";

type BrowserSignal = "gpc" | "dnt" | null;

export function AnalyticsPreference() {
  const [optedOut, setOptedOut] = React.useState<boolean | null>(null);
  const [browserSignal, setBrowserSignal] = React.useState<BrowserSignal>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const navigatorWithSignals = window.navigator as Navigator & { globalPrivacyControl?: boolean };
      setBrowserSignal(
        navigatorWithSignals.globalPrivacyControl === true
          ? "gpc"
          : navigatorWithSignals.doNotTrack === "1"
            ? "dnt"
            : null,
      );
      try {
        setOptedOut(window.localStorage.getItem(ANALYTICS_DISABLED_KEY) === "true");
      } catch {
        // Storage can be unavailable in a locked-down browser. Treat that as opted out, since
        // the honest reading of "I cannot record your choice" is not to record anything.
        setOptedOut(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update(next: boolean) {
    try {
      if (next) window.localStorage.setItem(ANALYTICS_DISABLED_KEY, "true");
      else window.localStorage.removeItem(ANALYTICS_DISABLED_KEY);
      setOptedOut(next);
    } catch {
      setOptedOut(true);
    }
  }

  if (optedOut === null) {
    return (
      <>
        <p className="text-sm text-muted-foreground">Checking your preference...</p>
        {/*
          Without JavaScript this control cannot work at all, since the preference lives in
          local storage. Saying so beats leaving someone on a message that never resolves,
          and the browser-level signals still apply either way.
        */}
        <noscript>
          <p className="text-sm text-muted-foreground">
            This control needs JavaScript, because the preference is stored in your browser. Global
            Privacy Control and Do Not Track are respected regardless, and no analytics is collected
            at all while scripts are blocked.
          </p>
        </noscript>
      </>
    );
  }

  const suppressedByBrowser = browserSignal !== null;

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      {suppressedByBrowser ? (
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>
            Your browser is sending{" "}
            {browserSignal === "gpc" ? "Global Privacy Control" : "Do Not Track"}, so analytics is
            already switched off. We respect that signal without needing you to change anything
            here.
          </span>
        </p>
      ) : (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={optedOut}
            onChange={(event) => update(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium text-foreground">
              Do not collect product analytics from this browser
            </span>
            <span className="mt-1 block text-muted-foreground">
              Nothing is sent while this is checked. The product works exactly the same either way;
              analytics only tells us which steps people reach, never what they wrote.
            </span>
          </span>
        </label>
      )}

      {!suppressedByBrowser && optedOut && (
        <p className="mt-3 flex items-center gap-2 text-xs text-primary">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Analytics is off for this browser.
        </p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        This preference is stored in this browser only, so it is not tied to your account and does
        not follow you to another device.
      </p>
    </div>
  );
}
