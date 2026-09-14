"use client";

/**
 * Owner-facing share link controls (M3-005, M3-006).
 *
 * Two things this component is careful about:
 *
 *  - It says plainly what a link exposes before one is created, because the whole product
 *    promise is that traces are private by default.
 *  - It shows the URL exactly once. Tokens are stored hashed, so the URL genuinely cannot be
 *    recovered later, and pretending otherwise would be dishonest.
 */

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

type ShareLink = {
  id: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
  viewCount: number;
  lastViewedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ShareControls({ memoryId, source }: { memoryId: string; source: string }) {
  const [links, setLinks] = React.useState<ShareLink[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [freshUrl, setFreshUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/share?memoryId=${encodeURIComponent(memoryId)}`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        setLinks([]);
        return;
      }
      const body = await response.json();
      setLinks(Array.isArray(body?.links) ? body.links : []);
    } catch {
      setLinks([]);
    }
  }, [memoryId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createLink() {
    setBusy(true);
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ memoryId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) {
        toast.error(body?.error?.message || "The link could not be created.");
        return;
      }
      setFreshUrl(body.url);
      setCopied(false);
      trackEvent("trace_shared", { source });
      await load();
      try {
        await navigator.clipboard.writeText(body.url);
        setCopied(true);
        toast.success("Link created and copied. It is shown only once.");
      } catch {
        toast.success("Link created. Copy it now, it is shown only once.");
      }
    } catch {
      toast.error("The link could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(linkId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/share?linkId=${encodeURIComponent(linkId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error?.message || "The link could not be revoked.");
        return;
      }
      trackEvent("share_link_revoked", { source });
      setFreshUrl(null);
      await load();
      toast.success("Link revoked. It stops working immediately.");
    } catch {
      toast.error("The link could not be revoked.");
    } finally {
      setBusy(false);
    }
  }

  const activeLinks = (links || []).filter((link) => link.active);

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Share this one trace
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            A link shows only this trace: its photos, its story, its date, its place name, and the
            people you named. It never exposes your other traces, your email, or an exact location.
            You can revoke it whenever you want.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void createLink()} disabled={busy}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Link2 className="h-3.5 w-3.5" aria-hidden />
          )}
          Create link
        </Button>
      </div>

      {freshUrl && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-medium">Copy this now. It is shown only once.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
              {freshUrl}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(freshUrl);
                  setCopied(true);
                  toast.success("Copied.");
                } catch {
                  toast.error("Copy failed. Select the link and copy it manually.");
                }
              }}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The link is stored only as a fingerprint, so it cannot be shown again. If you lose it,
            revoke it and create a new one.
          </p>
        </div>
      )}

      {links === null ? (
        <p className="mt-3 text-xs text-muted-foreground">Checking existing links...</p>
      ) : links.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No links yet. This trace is visible only to you.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <span className="text-xs">
                <span className="font-mono">{link.prefix}…</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {link.active ? "active" : link.revokedAt ? "revoked" : "expired"}
                  {" · created "}
                  {formatDate(link.createdAt)}
                  {link.viewCount > 0
                    ? ` · opened ${link.viewCount} ${link.viewCount === 1 ? "time" : "times"}`
                    : " · not opened yet"}
                </span>
              </span>
              {link.active && (
                <Button size="sm" variant="ghost" onClick={() => void revoke(link.id)} disabled={busy}>
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {activeLinks.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {activeLinks.length} active {activeLinks.length === 1 ? "link" : "links"} can open this
          trace right now.
        </p>
      )}
    </div>
  );
}
