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
      </div>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}
