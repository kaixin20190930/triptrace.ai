"use client";

import * as React from "react";
import { useState, useSyncExternalStore } from "react";
import { Drawer } from "vaul";
import {
  CalendarDays,
  Copy,
  Download,
  MapPin,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trackEvent } from "@/lib/analytics";
import { downloadMemoryPoster } from "@/lib/poster";
import { ShareControls } from "@/components/memory/share-controls";
import type { Memory as PosterMemory } from "@/lib/memory-types";
import type { Memory } from "@/lib/use-memories";

const DATE_PRECISIONS = ["unknown", "day", "month", "year", "approximate"] as const;

type FactDraft = {
  eventDate: string;
  datePrecision: string;
  place: string;
  people: string;
  factualSummary: string;
  confirmed: boolean;
};

type NarrativeDraft = {
  title: string;
  story: string;
  tags: string;
};

function toPosterMemory(m: Memory): PosterMemory {
  const displayDate = m.eventAt || m.createdAt || new Date().toISOString();
  return {
    id: m.id,
    title: m.title,
    story: m.story,
    place: m.place ?? "",
    mood: m.mood ?? "",
    tags: m.tags,
    date: new Date(displayDate).toISOString().slice(0, 10).replace(/-/g, "."),
    photoKeys: [],
    photoUrls: m.photoUrls,
    coverPhotoKey: m.coverPhotoUrl ?? null,
    coverPhotoUrl: m.coverPhotoUrl ?? null,
    ai: { source: "openai" },
  };
}

function useIsMobile() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia("(max-width: 767px)");
      const handler = () => onStoreChange();
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function formatDisplayDate(memory: Memory) {
  const displayDate = memory.eventAt || memory.createdAt;
  return displayDate
    ? new Date(displayDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Date not set";
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function createFactDraft(memory: Memory): FactDraft {
  return {
    eventDate: toDateInputValue(memory.eventAt),
    datePrecision: memory.datePrecision || (memory.eventAt ? "day" : "unknown"),
    place: memory.place || "",
    people: memory.people?.join(", ") || "",
    factualSummary: memory.factualSummary || "",
    confirmed: false,
  };
}

function createNarrativeDraft(memory: Memory): NarrativeDraft {
  return {
    title: memory.title || "",
    story: memory.story || "",
    tags: memory.tags?.join(", ") || "",
  };
}

function parsePeople(value: string) {
  return value
    .split(",")
    .map((person) => person.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 10);
}

function FactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 border-b border-border py-3 last:border-0">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function FactEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: FactDraft;
  saving: boolean;
  onChange: (patch: Partial<FactDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Edit Confirmed Facts</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            These fields control map, timeline, and factual recall. The story stays separate.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">Cancel fact editing</span>
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Event date
          <Input type="date" value={draft.eventDate} onChange={(event) => onChange({ eventDate: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Date precision
          <select
            value={draft.datePrecision}
            onChange={(event) => onChange({ datePrecision: event.target.value })}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DATE_PRECISIONS.map((precision) => (
              <option key={precision} value={precision}>
                {precision}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Place
          <Input value={draft.place} onChange={(event) => onChange({ place: event.target.value })} placeholder="City, place, or route" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          People
          <Input value={draft.people} onChange={(event) => onChange({ people: event.target.value })} placeholder="Names separated by commas" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Factual note
          <Textarea
            rows={5}
            value={draft.factualSummary}
            onChange={(event) => onChange({ factualSummary: event.target.value })}
            placeholder="What actually happened? Keep this factual and user-confirmed."
          />
        </label>
        <label className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.confirmed}
            onChange={(event) => onChange({ confirmed: event.target.checked })}
          />
          <span>I confirm these facts are accurate or intentionally marked unknown.</span>
        </label>
        <Button type="button" onClick={onSave} disabled={saving || !draft.confirmed}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Saving facts" : "Save facts"}
        </Button>
      </div>
    </section>
  );
}

function NarrativeEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: NarrativeDraft;
  saving: boolean;
  onChange: (patch: Partial<NarrativeDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const canSave = draft.title.trim().length > 0 && draft.story.trim().length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Edit AI Narrative</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Tune the title, story, and tags. Confirmed facts stay unchanged.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">Cancel narrative editing</span>
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Title
          <Input value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Story
          <Textarea rows={9} value={draft.story} onChange={(event) => onChange({ story: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Tags
          <Input value={draft.tags} onChange={(event) => onChange({ tags: event.target.value })} placeholder="Comma-separated tags" />
        </label>
        <Button type="button" onClick={onSave} disabled={saving || !canSave}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Saving story" : "Save story"}
        </Button>
      </div>
    </section>
  );
}

function MemoryContent({
  memory,
  source,
  factDraft,
  narrativeDraft,
  editingFacts,
  editingNarrative,
  savingFacts,
  savingNarrative,
  downloading,
  deleting,
  onDownload,
  onCopy,
  onDelete,
  onEditNarrative,
  onCancelNarrative,
  onNarrativeDraftChange,
  onSaveNarrative,
  onEditFacts,
  onCancelFacts,
  onFactDraftChange,
  onSaveFacts,
}: {
  memory: Memory;
  source: string;
  factDraft: FactDraft;
  narrativeDraft: NarrativeDraft;
  editingFacts: boolean;
  editingNarrative: boolean;
  savingFacts: boolean;
  savingNarrative: boolean;
  downloading: boolean;
  deleting: boolean;
  onDownload: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEditNarrative: () => void;
  onCancelNarrative: () => void;
  onNarrativeDraftChange: (patch: Partial<NarrativeDraft>) => void;
  onSaveNarrative: () => void;
  onEditFacts: () => void;
  onCancelFacts: () => void;
  onFactDraftChange: (patch: Partial<FactDraft>) => void;
  onSaveFacts: () => void;
}) {
  const photoUrls = memory.photoUrls.length ? memory.photoUrls : memory.coverPhotoUrl ? [memory.coverPhotoUrl] : [];
  const aiLabel = [memory.ai?.source, memory.ai?.model].filter(Boolean).join(" · ") || "AI narrative";
  const factSummary = memory.factualSummary?.trim() || "No factual summary has been confirmed yet.";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Life Trace</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight">{memory.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {formatDisplayDate(memory)}
            </span>
            {memory.place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {memory.place}
              </span>
            )}
            {memory.mood && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {memory.mood}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEditNarrative} disabled={editingNarrative}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Story
          </Button>
          <Button variant="outline" size="sm" onClick={onEditFacts} disabled={editingFacts}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Facts
          </Button>
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {downloading ? "Preparing" : "Image"}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {deleting ? "Deleting" : "Delete"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          {photoUrls.length > 0 && (
            <section className="space-y-2">
              <div className="overflow-hidden rounded-2xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrls[0]} alt="" className="max-h-[24rem] w-full object-cover" />
              </div>
              {photoUrls.length > 1 && (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {photoUrls.slice(1, 7).map((src, index) => (
                    <div key={`${src}-${index}`} className="overflow-hidden rounded-xl border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="aspect-square w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {editingNarrative ? (
            <NarrativeEditor
              draft={narrativeDraft}
              saving={savingNarrative}
              onChange={onNarrativeDraftChange}
              onCancel={onCancelNarrative}
              onSave={onSaveNarrative}
            />
          ) : (
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">AI Generated Memory</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold">Story</h3>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={onEditNarrative}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Edit story</span>
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{memory.story}</p>
            </section>
          )}

          {memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {memory.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {editingFacts ? (
            <FactEditor
              draft={factDraft}
              saving={savingFacts}
              onChange={onFactDraftChange}
              onCancel={onCancelFacts}
              onSave={onSaveFacts}
            />
          ) : (
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Confirmed Facts</p>
                <Button type="button" variant="ghost" size="icon-xs" onClick={onEditFacts}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Edit facts</span>
                </Button>
              </div>
              <div className="mt-2">
                <FactRow icon={<CalendarDays className="h-4 w-4" aria-hidden />} label="When" value={formatDisplayDate(memory)} />
                <FactRow icon={<MapPin className="h-4 w-4" aria-hidden />} label="Where" value={memory.place || "Unknown"} />
                <FactRow
                  icon={<UserRound className="h-4 w-4" aria-hidden />}
                  label="People"
                  value={memory.people?.length ? memory.people.join(", ") : "Not specified"}
                />
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Factual Note</p>
            <p className="mt-3 text-sm leading-6 text-foreground/85">{factSummary}</p>
          </section>

          {memory.id && <ShareControls memoryId={memory.id} source={source} />}

          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Narrative Source</p>
            <p className="mt-3 text-sm font-medium">{aiLabel}</p>
            {memory.ai?.generatedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Generated {new Date(memory.ai.generatedAt).toLocaleDateString("en-US")}
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Facts stay user-controlled. The story can be edited without changing the confirmed time, place, or people.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function MemoryDetail({
  memory,
  open,
  source = "unknown",
  onClose,
}: {
  memory: Memory | null;
  open: boolean;
  source?: "vault" | "timeline" | "map" | "unknown";
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [editedMemory, setEditedMemory] = useState<Memory | null>(null);
  const [factDraft, setFactDraft] = useState<FactDraft>(() => (memory ? createFactDraft(memory) : createFactDraft({} as Memory)));
  const [narrativeDraft, setNarrativeDraft] = useState<NarrativeDraft>(() =>
    memory ? createNarrativeDraft(memory) : createNarrativeDraft({} as Memory),
  );
  const [editingFacts, setEditingFacts] = useState(false);
  const [editingNarrative, setEditingNarrative] = useState(false);
  const [savingFacts, setSavingFacts] = useState(false);
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const trackedOpenRef = React.useRef("");
  const activeMemory = editedMemory?.id && editedMemory.id === memory?.id ? editedMemory : memory;

  React.useEffect(() => {
    if (!open) {
      trackedOpenRef.current = "";
      return;
    }
    if (!activeMemory?.id || trackedOpenRef.current === activeMemory.id) return;
    trackedOpenRef.current = activeMemory.id;
    trackEvent("trace_opened", { source });
  }, [activeMemory?.id, open, source]);

  if (!activeMemory) return null;

  async function handleDownload() {
    if (!activeMemory || downloading) return;
    setDownloading(true);
    try {
      await downloadMemoryPoster(toPosterMemory(activeMemory), {
        moodLabel: activeMemory.mood ?? "",
        language: "en",
        isDark: false,
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    if (!activeMemory) return;
    const lines = [
      activeMemory.title,
      "",
      activeMemory.story,
      "",
      `Date: ${formatDisplayDate(activeMemory)}`,
      `Place: ${activeMemory.place || "Unknown"}`,
      activeMemory.people?.length ? `People: ${activeMemory.people.join(", ")}` : "",
      activeMemory.tags.length ? `Tags: ${activeMemory.tags.join(", ")}` : "",
    ].filter(Boolean);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Trace copied.");
  }

  async function handleDelete() {
    if (!activeMemory?.id || deleting) return;
    const confirmed = window.confirm(
      "Delete this trace from your private Atlas? This also removes its stored media when possible.",
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/memories?memoryId=${encodeURIComponent(activeMemory.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || "memory_delete_failed");

      window.dispatchEvent(new Event("triptrace:memories-updated"));
      trackEvent("trace_deleted", {
        source,
        hadMedia: activeMemory.photoUrls.length > 0,
      });
      toast.success(data.deleted?.mediaCleanupFailed ? "Trace deleted. Media cleanup will need a retry." : "Trace deleted.");
      onClose();
    } catch {
      toast.error("Could not delete this trace. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveFacts() {
    if (!activeMemory?.id || savingFacts || !factDraft.confirmed) return;
    setSavingFacts(true);
    const nextPeople = parsePeople(factDraft.people);
    const nextEventAt = factDraft.eventDate ? `${factDraft.eventDate}T00:00:00.000Z` : null;
    const payload = {
      eventAt: nextEventAt,
      datePrecision: factDraft.datePrecision,
      place: factDraft.place,
      people: nextPeople,
      factualSummary: factDraft.factualSummary,
      latitude: activeMemory.latitude ?? null,
      longitude: activeMemory.longitude ?? null,
      factsConfirmed: true,
    };

    try {
      const res = await fetch(`/api/memories?memoryId=${encodeURIComponent(activeMemory.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || "facts_update_failed");

      const nextMemory: Memory = {
        ...activeMemory,
        eventAt: nextEventAt,
        datePrecision: factDraft.datePrecision,
        place: factDraft.place,
        people: nextPeople,
        factualSummary: factDraft.factualSummary,
        factsConfirmedAt: new Date().toISOString(),
      };
      setEditedMemory(nextMemory);
      setFactDraft(createFactDraft(nextMemory));
      setEditingFacts(false);
      window.dispatchEvent(new Event("triptrace:memories-updated"));
      trackEvent("trace_facts_edited", { source, fieldsCount: 5 });
      toast.success("Facts updated.");
    } catch {
      toast.error("Could not update these facts. Please try again.");
    } finally {
      setSavingFacts(false);
    }
  }

  async function handleSaveNarrative() {
    if (!activeMemory?.id || savingNarrative) return;
    const title = narrativeDraft.title.trim();
    const story = narrativeDraft.story.trim();
    const tags = parseTags(narrativeDraft.tags);
    if (!title || !story) {
      toast.error("Title and story are required.");
      return;
    }

    setSavingNarrative(true);
    try {
      const res = await fetch(`/api/memories?memoryId=${encodeURIComponent(activeMemory.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, story, tags }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || "narrative_update_failed");

      const nextMemory: Memory = {
        ...activeMemory,
        title,
        story,
        tags,
      };
      setEditedMemory(nextMemory);
      setNarrativeDraft(createNarrativeDraft(nextMemory));
      setEditingNarrative(false);
      window.dispatchEvent(new Event("triptrace:memories-updated"));
      trackEvent("trace_story_edited", { source });
      toast.success("Story updated.");
    } catch {
      toast.error("Could not update this story. Please try again.");
    } finally {
      setSavingNarrative(false);
    }
  }

  const content = (
    <MemoryContent
      memory={activeMemory}
      source={source}
      factDraft={factDraft}
      narrativeDraft={narrativeDraft}
      editingFacts={editingFacts}
      editingNarrative={editingNarrative}
      savingFacts={savingFacts}
      savingNarrative={savingNarrative}
      downloading={downloading}
      deleting={deleting}
      onDownload={handleDownload}
      onCopy={handleCopy}
      onDelete={handleDelete}
      onEditNarrative={() => {
        setNarrativeDraft(createNarrativeDraft(activeMemory));
        setEditingNarrative(true);
      }}
      onCancelNarrative={() => {
        setNarrativeDraft(createNarrativeDraft(activeMemory));
        setEditingNarrative(false);
      }}
      onNarrativeDraftChange={(patch) => setNarrativeDraft((current) => ({ ...current, ...patch }))}
      onSaveNarrative={handleSaveNarrative}
      onEditFacts={() => {
        setFactDraft(createFactDraft(activeMemory));
        setEditingFacts(true);
      }}
      onCancelFacts={() => {
        setFactDraft(createFactDraft(activeMemory));
        setEditingFacts(false);
      }}
      onFactDraftChange={(patch) => setFactDraft((current) => ({ ...current, ...patch, confirmed: patch.confirmed ?? false }))}
      onSaveFacts={handleSaveFacts}
    />
  );

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-card px-4 pb-safe pt-4 focus:outline-none"
            style={{ maxHeight: "90dvh" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <Drawer.Title className="sr-only">{activeMemory.title}</Drawer.Title>
            <div className="overflow-y-auto pb-8">{content}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[86vh] max-w-5xl overflow-y-auto p-5 sm:max-w-5xl">
        <DialogTitle className="sr-only">{activeMemory.title}</DialogTitle>
        {content}
      </DialogContent>
    </Dialog>
  );
}
