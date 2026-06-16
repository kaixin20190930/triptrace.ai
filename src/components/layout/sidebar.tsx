"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRIVATE_LINKS = [
  { href: "#capture", icon: "＋", key: "capture" },
  { href: "#vault", icon: "▤", key: "vault" },
  { href: "#map", icon: "⌖", key: "map" },
  { href: "#timeline", icon: "⌁", key: "timeline" },
  { href: "#insights", icon: "◎", key: "insights" },
] as const;

const PUBLIC_LINKS = [
  { href: "#community", icon: "◌", key: "community" },
  { href: "/faq", icon: "?", key: "faq" },
  { href: "/templates", icon: "✦", key: "templates" },
] as const;

export function Sidebar({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const initial = (user?.displayName || "T").slice(0, 1).toUpperCase();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-border bg-card px-4 py-6">
      <Link href="/" className="flex items-center gap-3 px-2" aria-label="TripTrace.ai">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-serif text-lg font-bold text-primary-foreground">
          T
        </span>
        <span className="flex flex-col leading-tight">
          <strong className="font-serif text-base">TripTrace.ai</strong>
          <small className="text-xs text-muted-foreground">AI Life Memory OS</small>
        </span>
      </Link>

      <nav aria-label="主要导航" className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t("nav.groupPrivate")}</p>
        {PRIVATE_LINKS.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-accent/10"
          >
            <span aria-hidden className="w-4 text-center">
              {link.icon}
            </span>
            <span>{t(`nav.${link.key}`)}</span>
          </a>
        ))}
      </nav>

      <nav aria-label="公开页面导航" className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t("nav.groupPublic")}</p>
        {PUBLIC_LINKS.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-accent/10"
          >
            <span aria-hidden className="w-4 text-center">
              {link.icon}
            </span>
            <span>{t(`nav.${link.key}`)}</span>
          </a>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-border bg-background p-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition hover:bg-accent/10">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <span className="flex flex-col leading-tight">
                <strong className="text-sm">{t("auth.signedIn")}</strong>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => signOut()}>{t("auth.signout")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={onOpenAccount}
            className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition hover:bg-accent/10"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback>T</AvatarFallback>
            </Avatar>
            <span className="flex flex-col leading-tight">
              <strong className="text-sm">{t("auth.notSignedIn")}</strong>
              <span className="text-xs text-muted-foreground">{t("auth.summaryLoggedOut")}</span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
