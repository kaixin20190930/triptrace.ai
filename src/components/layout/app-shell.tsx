"use client";

import * as React from "react";
import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AccountDialog } from "./account-dialog";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [accountOpen, setAccountOpen] = React.useState(false);

  React.useEffect(() => {
    const openAccount = () => setAccountOpen(true);
    window.addEventListener("triptrace:open-account", openAccount);
    return () => window.removeEventListener("triptrace:open-account", openAccount);
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar onOpenAccount={() => setAccountOpen(true)} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="font-serif text-lg font-semibold">
              TripTrace.ai
            </Link>
            <div className="flex items-center gap-2">
              <Topbar />
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
                aria-label="Open account"
              >
                <CircleUserRound className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <nav aria-label="Mobile navigation" className="mt-3 flex gap-2 overflow-x-auto pb-1 text-sm">
            {[
              ["/#capture", "Create"],
              ["/vault", "My Atlas"],
              ["/timeline", "Timeline"],
              ["/map", "Map"],
              ["/explore", "History"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5"
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="px-4 py-5 sm:px-8 md:px-10 md:py-6">
          <div className="mb-8 hidden items-center justify-end md:flex">
          <Topbar />
          </div>
          {children}
        </main>
        {/* The privacy notice has to be reachable from anywhere, not just from settings. */}
        <footer className="border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-8 md:px-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Every trip leaves traces. Every trace tells a story.</span>
            <Link href="/privacy" className="underline-offset-4 hover:underline hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-4 hover:underline hover:text-foreground">
              Terms
            </Link>
            <span>Your traces are private by default.</span>
          </div>
        </footer>
      </div>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}
