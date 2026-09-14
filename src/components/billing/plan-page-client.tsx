"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CreditCard, Download, Loader2, Trash2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { getGuestDeviceId } from "@/lib/guest-id";
import { PLANS, type PlanKey } from "@/lib/plans";

type Entitlements = {
  plan: { key: PlanKey; label: string; signedIn: boolean; aiGenerationPeriod: "lifetime" | "monthly" };
  limits: { permanentTraces: number; aiGenerations: number; imagesPerTrace: number };
  usage: {
    aiGenerations: { used: number; limit: number; remaining: number; periodKey: string };
    permanentTraces: { used: number; limit: number; remaining: number };
  };
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
};

const PRICING = {
  monthly: { label: "$9.99", period: "per month" },
  annual: { label: "$79", period: "per year" },
} as const;

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{used}</span> of <span className="font-mono">{limit}</span>
        </p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/30"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function PlanPageClient() {
  const { user } = useAuth();
  const [data, setData] = React.useState<Entitlements | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<"monthly" | "annual" | "portal" | null>(null);
  const [busy, setBusy] = React.useState<"json" | "archive" | "delete" | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleteConfirm, setDeleteConfirm] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query = user ? "" : `?guestId=${encodeURIComponent(getGuestDeviceId())}`;
      const response = await fetch(`/api/entitlements${query}`, { credentials: "same-origin" });
      const body = await response.json();
      setData(response.ok ? (body as Entitlements) : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Deferred by a tick for the same reason as `use-memories.ts`: the fetch sets state, and
  // state updates must not be issued synchronously from an effect body.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // A completed checkout returns here, but the plan only changes once the verified webhook
  // has been processed, so the page refetches rather than assuming success.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    if (checkout === "success") {
      toast.success("Payment received. Your plan updates as soon as Stripe confirms it.");
      const timer = window.setTimeout(() => void load(), 2_000);
      return () => window.clearTimeout(timer);
    }
    if (checkout === "cancelled") toast.message("Checkout cancelled. Nothing was charged.");
  }, [load]);

  async function startCheckout(interval: "monthly" | "annual") {
    setPending(interval);
    trackEvent("checkout_started", { source: "plan_page", planKey: "founding_plus" });
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ interval }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.url) {
        window.location.assign(body.url);
        return;
      }
      toast.error(body?.error?.message || "Checkout could not be started.");
    } catch {
      toast.error("Checkout could not be started.");
    } finally {
      setPending(null);
    }
  }

  async function openPortal() {
    setPending("portal");
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.url) {
        window.location.assign(body.url);
        return;
      }
      toast.error(body?.error?.message || "The billing portal is unavailable.");
    } catch {
      toast.error("The billing portal is unavailable.");
    } finally {
      setPending(null);
    }
  }

  /**
   * Downloads an export.
   *
   * Fetched rather than opened as a plain link so a refusal, such as an archive that is too
   * large, can be shown as a readable message instead of dumping JSON into a browser tab.
   */
  async function downloadExport(path: string) {
    setBusy(path.endsWith("archive") ? "archive" : "json");
    try {
      const response = await fetch(path, { credentials: "same-origin" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error?.message || "The export could not be prepared.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const suggested = disposition.match(/filename="([^"]+)"/)?.[1];
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggested || (path.endsWith("archive") ? "triptrace-atlas.zip" : "triptrace-export.json");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch {
      toast.error("The export could not be prepared.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: deletePassword, confirm: deleteConfirm }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error?.message || "The account could not be deleted.");
        return;
      }
      toast.success("Your account and its contents have been deleted.");
      // A full reload is the honest end state: every cached view belongs to an account that
      // no longer exists.
      window.location.assign("/");
    } catch {
      toast.error("The account could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  const planKey = data?.plan.key ?? "guest";
  const isPaid = planKey === "founding_plus";
  const hasBillingHistory = Boolean(data?.subscription);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <section className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Plan and usage</p>
        <h1 className="mt-3 font-serif text-5xl font-semibold">What your Atlas includes</h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Every limit here is enforced on the server. Your memories always stay private, and
          they remain yours to read, export, and delete on any plan.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Current plan</p>
            <h2 className="mt-1 font-serif text-3xl font-semibold">
              {loading ? "Loading..." : data?.plan.label ?? "Unavailable"}
            </h2>
            {data?.subscription && (
              <p className="mt-1 text-sm text-muted-foreground">
                Status {data.subscription.status}
                {data.subscription.currentPeriodEnd
                  ? ` · renews ${new Date(data.subscription.currentPeriodEnd).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}`
                  : ""}
                {data.subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}
              </p>
            )}
            {!user && !loading && (
              <p className="mt-1 text-sm text-muted-foreground">
                Guests get one AI draft and cannot save permanently.{" "}
                <Link href="/#capture" className="text-primary underline-offset-4 hover:underline">
                  Create a free account
                </Link>{" "}
                to keep your traces.
              </p>
            )}
          </div>
          {hasBillingHistory && (
            <button
              type="button"
              onClick={openPortal}
              disabled={pending !== null}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-accent/20 disabled:opacity-60"
            >
              {pending === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CreditCard className="h-4 w-4" aria-hidden />
              )}
              Manage billing
            </button>
          )}
        </div>

        {data && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <UsageRow
              label="Saved traces"
              used={data.usage.permanentTraces.used}
              limit={data.usage.permanentTraces.limit}
            />
            <UsageRow
              label={data.plan.aiGenerationPeriod === "monthly" ? "AI drafts this month" : "AI drafts used"}
              used={data.usage.aiGenerations.used}
              limit={data.usage.aiGenerations.limit}
            />
          </div>
        )}
      </section>

      {!isPaid && (
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Founding Plus</p>
          <h2 className="mt-1 font-serif text-3xl font-semibold">Room for a whole life, not a sample</h2>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {[
              `${PLANS.founding_plus.limits.permanentTraces} saved traces`,
              `${PLANS.founding_plus.limits.aiGenerations} AI drafts per month`,
              `${PLANS.founding_plus.limits.imagesPerTrace} photos per trace`,
              "Private by default, always exportable",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            {(["monthly", "annual"] as const).map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => startCheckout(interval)}
                disabled={pending !== null || !user}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
              >
                {pending === interval && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {PRICING[interval].label} {PRICING[interval].period}
              </button>
            ))}
          </div>
          {!user && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sign in before upgrading so the subscription attaches to your Atlas.
            </p>
          )}
        </section>
      )}

      {user && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Your data</p>
          <h2 className="mt-1 font-serif text-3xl font-semibold">Yours to take, yours to erase</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Export works on every plan, including Free. Retrieving your own memories is a right,
            not a paid feature.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => downloadExport("/api/export")}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-accent/20 disabled:opacity-60"
            >
              {busy === "json" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Export everything as JSON
            </button>
            <button
              type="button"
              onClick={() => downloadExport("/api/export/archive")}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-accent/20 disabled:opacity-60"
            >
              {busy === "archive" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Download archive with photos
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The JSON file holds every trace with your confirmed facts kept separate from the
            AI-drafted story. The archive adds the photo files themselves, which is what makes the
            export usable after an account is gone.
          </p>

          <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-foreground">Delete this account</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This removes your traces, your photos, your saved facts, and your account. It cannot
              be undone, and there is no hidden copy. Export first if you want to keep anything.
            </p>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-destructive/60 px-4 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete account
              </button>
            ) : (
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void deleteAccount();
                }}
              >
                <div>
                  <label htmlFor="delete-password" className="text-xs font-medium">
                    Confirm your password
                  </label>
                  <input
                    id="delete-password"
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    className="mt-1 w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="delete-confirm" className="text-xs font-medium">
                    Type <span className="font-mono">DELETE</span> to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    className="mt-1 w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={busy !== null || deleteConfirm !== "DELETE" || !deletePassword}
                    className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition disabled:opacity-60"
                  >
                    {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    Permanently delete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeletePassword("");
                      setDeleteConfirm("");
                    }}
                    className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 text-sm leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">How limits behave</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>A failed AI draft does not use up an allowance.</li>
          <li>Deleting a saved trace frees a slot immediately.</li>
          <li>Monthly AI allowances reset at the start of each UTC calendar month.</li>
          <li>
            If a subscription lapses or is cancelled, the account returns to the Free
            allowance and keeps full read, export, and delete rights over everything already
            saved.
          </li>
        </ul>
      </section>
    </main>
  );
}
