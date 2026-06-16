"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AccountDialog } from "./account-dialog";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [accountOpen, setAccountOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar onOpenAccount={() => setAccountOpen(true)} />
      <main className="flex-1 px-6 py-6 sm:px-10">
        <div className="mb-8 flex items-center justify-end">
          <Topbar onOpenAccount={() => setAccountOpen(true)} />
        </div>
        {children}
      </main>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}
