"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpenText, Compass, Map, Plus, Route } from "lucide-react";
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
  { href: "/#capture", icon: Plus, key: "capture" },
  { href: "/vault", icon: BookOpenText, key: "vault" },
  { href: "/timeline", icon: Route, key: "timeline" },
] as const;

const PUBLIC_LINKS = [
  { href: "/explore", icon: Compass, key: "community" },
  { href: "/map", icon: Map, key: "map" },
] as const;

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-accent/10"
    >
      <Icon aria-hidden className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const initial = (user?.displayName || "T").slice(0, 1).toUpperCase();

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-card px-4 py-6 md:flex">
      <Link href="/" className="flex items-center gap-3 px-2" aria-label="TripTrace.ai">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-serif text-lg font-bold text-primary-foreground">
          T
        </span>
        <span className="flex flex-col leading-tight">
          <strong className="font-serif text-base">TripTrace.ai</strong>
          <small className="text-xs text-muted-foreground">AI Life Atlas</small>
        </span>
      </Link>

      <nav aria-label="Your Life Atlas" className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t("nav.groupPrivate")}</p>
        {PRIVATE_LINKS.map((link) => (
          <NavLink
            key={link.key}
            href={link.href}
            icon={link.icon}
            label={t(`nav.${link.key}`)}
          />
        ))}
      </nav>

      <nav aria-label="Explore TripTrace" className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t("nav.groupPublic")}</p>
        {PUBLIC_LINKS.map((link) => (
          <NavLink
            key={link.key}
            href={link.href}
            icon={link.icon}
            label={t(`nav.${link.key}`)}
          />
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
