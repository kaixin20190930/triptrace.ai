"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { X } from "lucide-react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n";
import {
  fetchMemoryStream,
  filterAbstractTags,
  GenerationRequestError,
  type GenerateInput,
} from "@/lib/generate";
import { getGuestDeviceId } from "@/lib/guest-id";
import { isEntitlementCode } from "@/lib/plans";
import { downloadMemoryPoster } from "@/lib/poster";
import { getTodayLabel } from "@/lib/format";
import { extractExif, type ExtractedExif } from "@/lib/exif";
import type { Memory, GenerateResult } from "@/lib/memory-types";
import {
  clearCaptureDraft,
  loadCaptureDraft,
  saveCaptureDraft,
  type StoredCaptureDraft,
} from "@/lib/draft-store";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MOOD_KEYS = ["calm", "happy", "moved", "relaxed", "lost"] as const;
type MoodKey = (typeof MOOD_KEYS)[number];

type UploadedPhoto = { key: string; url: string; filename: string };
type PreparedPhoto = { uploadFile: File; visionDataUrl: string };
type ExifCandidate = ExtractedExif & { filename: string };

const MAX_PHOTOS = 20;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_VISION_IMAGES = 4;

async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image_canvas_unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (output) => (output ? resolve(output) : reject(new Error("image_compression_failed"))),
      "image/jpeg",
      0.82,
    );
  });
  const visionDataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";

  return {
    uploadFile: new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }),
    visionDataUrl,
  };
}

function emptyMemory(): Memory {
  return {
    title: "",
    story: "",
    place: "",
    mood: "calm",
    tags: [],
    date: getTodayLabel(),
    photoKeys: [],
    photoUrls: [],
    coverPhotoKey: null,
    coverPhotoUrl: null,
    ai: { source: "local" },
  };
}

function toStoredDraftFile(file: File) {
  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file,
  };
}

function reviveDraftFiles(files: StoredCaptureDraft["files"]) {
  return files.map((item) => new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified }));
}

function hasDraftContent(memory: Memory | null, moment: string, place: string, files: File[]) {
  return Boolean(memory || moment.trim() || place.trim() || files.length > 0);
}

function fileIdentity(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function mergeExifCandidates(candidates: ExifCandidate[]) {
  return candidates.reduce<ExifCandidate | null>((best, current) => {
    if (!best) return current;
    const bestScore = Number(Boolean(best.capturedAt)) + Number(Boolean(best.latitude && best.longitude));
    const currentScore = Number(Boolean(current.capturedAt)) + Number(Boolean(current.latitude && current.longitude));
    return currentScore > bestScore ? current : best;
  }, null);
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? `${value}T00:00:00.000Z` : null;
}

function formatCoordinateCandidate(value: number | null | undefined) {
  return Number.isFinite(value) ? String(Number(value).toFixed(5)) : "";
}

function parseCoordinateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function aiFallbackMessage(reason?: string | null) {
  if (reason === "missing_openai_api_key") {
    return "AI is not configured in this environment. This is a local fallback draft, not an OpenAI result.";
  }
  if (reason?.startsWith("openai_http_")) {
    return "OpenAI could not complete this request. This fallback keeps your inputs available so you can try again.";
  }
  if (reason === "openai_parse_failed") {
    return "The AI response could not be read. This fallback is editable, but it was not written by OpenAI.";
  }
  return "AI was unavailable. This is an editable local fallback, not an AI-generated story.";
}

function DraftPhotoGallery({ urls }: { urls: string[] }) {
  const photos = [...new Set(urls.filter(Boolean))];
  if (photos.length === 0) return null;

  const visible = photos.slice(0, 4);
  const gridClass =
    visible.length === 1
      ? "grid-cols-1"
      : visible.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 grid-rows-2";

  return (
    <div className={`grid h-72 gap-1.5 overflow-hidden rounded-xl ${gridClass}`}>
      {visible.map((src, index) => {
        const isLead = visible.length === 3 && index === 0;
        const remaining = photos.length - visible.length;
        return (
          <div
            key={`${src}-${index}`}
            className={`relative min-h-0 overflow-hidden bg-muted ${isLead ? "row-span-2" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            {index === visible.length - 1 && remaining > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                +{remaining}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CapturePanel() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();

  const [moment, setMoment] = React.useState("");
  const [place, setPlace] = React.useState("");
  const [mood, setMood] = React.useState<MoodKey>("calm");
  const [files, setFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [exifCandidate, setExifCandidate] = React.useState<ExifCandidate | null>(null);
  const [exifScanning, setExifScanning] = React.useState(false);
  const [confirmedEventDate, setConfirmedEventDate] = React.useState("");
  const [latitude, setLatitude] = React.useState<number | null>(null);
  const [longitude, setLongitude] = React.useState<number | null>(null);
  const [latitudeInput, setLatitudeInput] = React.useState("");
  const [longitudeInput, setLongitudeInput] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [memory, setMemory] = React.useState<Memory | null>(null);
  const [factsConfirmed, setFactsConfirmed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedState, setSavedState] = React.useState<"idle" | "cloud" | "local">("idle");
  const [restored, setRestored] = React.useState(false);
  const [aiConfigured, setAiConfigured] = React.useState<boolean | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const previewUrlsRef = React.useRef<string[]>([]);
  const demoStartedRef = React.useRef(false);
  const textEnteredRef = React.useRef(false);

  function markDemoStarted(inputMode: "text" | "photo") {
    if (demoStartedRef.current) return;
    demoStartedRef.current = true;
    trackEvent("personal_demo_start", { source: "capture_panel", inputMode });
  }

  React.useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  React.useEffect(() => {
    let active = true;
    void fetch("/api/generate-memory")
      .then((response) => response.json())
      .then((data) => {
        if (active) setAiConfigured(data?.configured === true);
      })
      .catch(() => {
        if (active) setAiConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const draft = await loadCaptureDraft();
        if (!active) return;
        if (draft) {
          setMoment(draft.moment || "");
          setPlace(draft.place || "");
          setMood((draft.mood as MoodKey) || "calm");
          const restoredFiles = reviveDraftFiles(draft.files || []);
          const restoredPreviews = restoredFiles.map((file) => URL.createObjectURL(file));
          previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
          previewUrlsRef.current = restoredPreviews;
          setFiles(restoredFiles);
          setPreviews(restoredPreviews);
          if (draft.memory) {
            setMemory({
              ...emptyMemory(),
              ...draft.memory,
              photoUrls: restoredPreviews,
              coverPhotoUrl: restoredPreviews[0] || draft.memory.coverPhotoUrl || null,
            });
          }
          setFactsConfirmed(draft.factsConfirmed);
          setSavedState(draft.savedState);
          setExifCandidate(draft.exifCandidate || null);
          setConfirmedEventDate(draft.confirmedEventDate || toDateInputValue(draft.memory?.eventAt));
          const restoredLatitude =
            typeof draft.latitude === "number" ? draft.latitude : typeof draft.memory?.latitude === "number" ? draft.memory.latitude : null;
          const restoredLongitude =
            typeof draft.longitude === "number" ? draft.longitude : typeof draft.memory?.longitude === "number" ? draft.memory.longitude : null;
          setLatitude(restoredLatitude);
          setLongitude(restoredLongitude);
          setLatitudeInput(formatCoordinateCandidate(restoredLatitude));
          setLongitudeInput(formatCoordinateCandidate(restoredLongitude));
        }
      } finally {
        if (active) setRestored(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      if (savedState === "cloud") {
        void clearCaptureDraft();
        return;
      }
      if (!hasDraftContent(memory, moment, place, files)) {
        void clearCaptureDraft();
        return;
      }
      void saveCaptureDraft({
        moment,
        place,
        mood,
        memory,
        files: files.map(toStoredDraftFile),
        exifCandidate,
        confirmedEventDate,
        latitude,
        longitude,
        factsConfirmed,
        savedState,
        updatedAt: new Date().toISOString(),
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [restored, savedState, moment, place, mood, memory, exifCandidate, confirmedEventDate, latitude, longitude, factsConfirmed, files]);

  function moodLabel(key: string) {
    return t(`mood.${key}`);
  }

  function updateDraft(patch: Partial<Memory>) {
    setMemory((current) => (current ? { ...current, ...patch } : current));
    setFactsConfirmed(false);
    setSavedState("idle");
  }

  async function scanExif(selectedFiles: File[]) {
    setExifScanning(true);
    try {
      const results = await Promise.all(
        selectedFiles.map(async (file) => ({
          ...(await extractExif(file)),
          filename: file.name,
        })),
      );
      const candidate = mergeExifCandidates(
        results.filter((item) => item.capturedAt || (item.latitude !== null && item.longitude !== null)),
      );
      setExifCandidate(candidate);
      if (candidate) {
        trackEvent("personal_exif_detected", {
          photoCount: selectedFiles.length,
          hasDate: Boolean(candidate.capturedAt),
          hasGps: candidate.latitude !== null && candidate.longitude !== null,
        });
      }
      if (candidate?.capturedAt) {
        const dateValue = toDateInputValue(candidate.capturedAt);
        setConfirmedEventDate((current) => current || dateValue);
        setMemory((current) =>
          current && !current.eventAt
            ? { ...current, eventAt: candidate.capturedAt, datePrecision: "day" }
            : current,
        );
      }
      if (candidate && candidate.latitude !== null && candidate.longitude !== null) {
        setLatitude((current) => current ?? candidate.latitude);
        setLongitude((current) => current ?? candidate.longitude);
        setLatitudeInput((current) => current || formatCoordinateCandidate(candidate.latitude));
        setLongitudeInput((current) => current || formatCoordinateCandidate(candidate.longitude));
        setMemory((current) =>
          current && current.latitude == null && current.longitude == null
            ? { ...current, latitude: candidate.latitude, longitude: candidate.longitude }
            : current,
        );
      }
    } finally {
      setExifScanning(false);
    }
  }

  function handleFilesSelected(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (incoming.length > 0) markDemoStarted("photo");
    const invalidType = incoming.find((file) => !file.type.startsWith("image/"));
    const oversized = incoming.find((file) => file.size > MAX_SOURCE_BYTES);
    if (invalidType) {
      trackEvent("personal_photo_validation_failed", {
        source: "capture_panel",
        reason: "invalid_type",
        photoCount: incoming.length,
      });
      toast.error(`"${invalidType.name}" is not a supported image.`);
      return;
    }
    if (oversized) {
      trackEvent("personal_photo_validation_failed", {
        source: "capture_panel",
        reason: "oversized",
        photoCount: incoming.length,
      });
      toast.error(`"${oversized.name}" is larger than 10 MB.`);
      return;
    }

    const knownFiles = new Set(files.map(fileIdentity));
    const uniqueIncoming = incoming.filter((file) => {
      const identity = fileIdentity(file);
      if (knownFiles.has(identity)) return false;
      knownFiles.add(identity);
      return true;
    });
    const availableSlots = Math.max(0, MAX_PHOTOS - files.length);
    const accepted = uniqueIncoming.slice(0, availableSlots);

    if (uniqueIncoming.length > availableSlots) {
      trackEvent("personal_photo_validation_failed", {
        source: "capture_panel",
        reason: "too_many",
        photoCount: files.length + uniqueIncoming.length,
      });
      toast.error(
        availableSlots > 0
          ? `Only ${availableSlots} more ${availableSlots === 1 ? "photo fits" : "photos fit"}; the Atlas keeps up to ${MAX_PHOTOS}.`
          : `The ${MAX_PHOTOS}-photo limit has been reached.`,
      );
    }
    if (accepted.length === 0) {
      if (incoming.length > 0 && uniqueIncoming.length === 0) {
        toast.message("Those photos are already selected.");
      }
      return;
    }

    const arr = [...files, ...accepted];
    trackEvent("personal_photo_import", {
      source: "capture_panel",
      photoCount: arr.length,
    });
    const addedPreviews = accepted.map((file) => URL.createObjectURL(file));
    const nextPreviews = [...previews, ...addedPreviews];
    previewUrlsRef.current = nextPreviews;
    setFiles(arr);
    setPreviews(nextPreviews);
    void scanExif(arr);
  }

  async function handleRemovePhoto(index: number) {
    if (generating || saving || savedState === "cloud") return;

    const removedFile = files[index];
    const removedPreview = previews[index];
    const uploadedKey = memory?.photoKeys[index];
    const nextFiles = files.filter((_, fileIndex) => fileIndex !== index);
    const nextPreviews = previews.filter((_, previewIndex) => previewIndex !== index);

    if (removedPreview) URL.revokeObjectURL(removedPreview);
    previewUrlsRef.current = nextPreviews;
    setFiles(nextFiles);
    setPreviews(nextPreviews);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const removedExifSource = Boolean(
      removedFile &&
      exifCandidate &&
      removedFile.name === exifCandidate.filename,
    );
    if (removedExifSource && exifCandidate) {
      const removedCandidate = exifCandidate;
      setExifCandidate(null);
      setConfirmedEventDate("");
      setLatitude(null);
      setLongitude(null);
      setLatitudeInput("");
      setLongitudeInput("");
      setMemory((current) => {
        if (!current) return current;
        return {
          ...current,
          eventAt:
            current.eventAt === removedCandidate.capturedAt
              ? null
              : current.eventAt,
          datePrecision:
            current.eventAt === removedCandidate.capturedAt
              ? "unknown"
              : current.datePrecision,
          latitude:
            current.latitude === removedCandidate.latitude
              ? null
              : current.latitude,
          longitude:
            current.longitude === removedCandidate.longitude
              ? null
              : current.longitude,
        };
      });
      if (nextFiles.length > 0) void scanExif(nextFiles);
    }

    setMemory((current) => {
      if (!current) return current;
      const photoKeys = current.photoKeys.filter(
        (_, photoIndex) => photoIndex !== index,
      );
      const photoUrls = current.photoUrls.filter(
        (_, photoIndex) => photoIndex !== index,
      );
      return {
        ...current,
        photoKeys,
        photoUrls,
        coverPhotoKey: photoKeys[0] || null,
        coverPhotoUrl: photoUrls[0] || null,
      };
    });
    setFactsConfirmed(false);
    setSavedState("idle");
    trackEvent("personal_photo_removed", {
      source: "capture_panel",
      remainingCount: nextFiles.length,
      hadUploadedCopy: Boolean(uploadedKey),
    });

    if (uploadedKey) {
      try {
        const response = await fetch(
          `/api/media?key=${encodeURIComponent(uploadedKey)}`,
          { method: "DELETE" },
        );
        if (!response.ok) throw new Error("media_delete_failed");
      } catch {
        toast.warning(
          "Photo removed from this draft. Its temporary upload will be cleaned up later.",
        );
      }
    }
  }

  async function uploadPhotos(selected: File[]): Promise<UploadedPhoto[]> {
    const formData = new FormData();
    selected.forEach((file) => formData.append("photos", file));
    const res = await fetch("/api/media", { method: "POST", body: formData });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const code = String(data?.error?.code || "media_upload_failed");
      if (isEntitlementCode(code)) {
        trackEvent("paywall_viewed", { source: "capture_upload", reason: code });
      }
      // Keep the server's explanation so a plan or validation refusal is not reduced
      // to a generic upload failure.
      throw new Error(data?.error?.message || "media_upload_failed");
    }
    return data.files as UploadedPhoto[];
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!moment.trim() && files.length === 0) return;

    markDemoStarted(moment.trim() ? "text" : "photo");
    const generationStartedAt = Date.now();
    trackEvent("personal_story_generate_started", {
      hasText: Boolean(moment.trim()),
      photoCount: files.length,
      hasDate: Boolean(confirmedEventDate || exifCandidate?.capturedAt),
      hasGps:
        (parseCoordinateInput(latitudeInput) ?? latitude) !== null &&
        (parseCoordinateInput(longitudeInput) ?? longitude) !== null,
    });
    setGenerating(true);
    setSavedState("idle");
    setFactsConfirmed(false);

    const prepared: PreparedPhoto[] = [];
    try {
      for (const file of files) prepared.push(await preparePhoto(file));
    } catch {
      trackEvent("personal_story_generate_failed", {
        reason: "photo_preparation_failed",
        photoCount: files.length,
        durationMs: Date.now() - generationStartedAt,
      });
      toast.error("One of these photos could not be prepared. Try JPEG, PNG, or WebP.");
      setGenerating(false);
      return;
    }

    const payload: GenerateInput = {
      moment: moment.trim(),
      place: place.trim(),
      mood,
      moodLabel: moodLabel(mood),
      images: prepared.slice(0, MAX_VISION_IMAGES).map((photo) => photo.visionDataUrl),
      photoCount: files.length,
      guestId: user ? undefined : getGuestDeviceId(),
    };

    let uploaded: UploadedPhoto[] = [];
    try {
      if (user && files.length) {
        uploaded = await uploadPhotos(prepared.map((photo) => photo.uploadFile));
      }
    } catch (thrown) {
      const detail = thrown instanceof Error && thrown.message !== "media_upload_failed" ? thrown.message : "";
      toast.error(
        detail ||
          (language === "zh"
            ? "照片上传失败，先生成不带图的卡片。"
            : "Photo upload failed; generating without images."),
      );
    }

    const photoKeys = uploaded.map((p) => p.key);
    const photoUrls = uploaded.length ? uploaded.map((p) => p.url) : previews;
    const latitudeValue = parseCoordinateInput(latitudeInput) ?? latitude;
    const longitudeValue = parseCoordinateInput(longitudeInput) ?? longitude;
    const baseMeta = {
      place: payload.place || "",
      mood: payload.mood || "calm",
      photoKeys,
      photoUrls,
      coverPhotoKey: photoKeys[0] || null,
      coverPhotoUrl: photoUrls[0] || null,
      date: getTodayLabel(),
      eventAt: toIsoDate(confirmedEventDate) || exifCandidate?.capturedAt || null,
      datePrecision: confirmedEventDate || exifCandidate?.capturedAt ? "day" : "unknown",
      latitude: latitudeValue,
      longitude: longitudeValue,
    };

    let result: GenerateResult | null = null;
    let refusal: GenerationRequestError | null = null;
    try {
      const streamTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 45000));
      result = await Promise.race([
        fetchMemoryStream(payload, (partial) => {
          if (partial.title || partial.story) {
            setMemory({
              ...emptyMemory(),
              ...baseMeta,
              title: partial.title || "",
              story: partial.story || "",
              tags: partial.tags || [],
            });
          }
        }),
        streamTimeout,
      ]);
    } catch (thrown) {
      result = null;
      // A server refusal such as an exhausted plan allowance is a final answer, not a
      // transport hiccup, so it must not be retried and its message must survive.
      if (thrown instanceof GenerationRequestError && !thrown.retryable) refusal = thrown;
    }

    if (!result && !refusal) {
      try {
        const res = await fetch("/api/generate-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          result = await res.json();
        } else {
          const body = await res.json().catch(() => null);
          const code = String(body?.error?.code || `http_${res.status}`);
          const message = String(body?.error?.message || "");
          if (res.status < 500 && res.status !== 429) {
            refusal = new GenerationRequestError(code, message, res.status, false);
          }
        }
      } catch {
        result = null;
      }
    }

    if (refusal) {
      trackEvent("personal_story_generate_failed", {
        reason: refusal.code,
        photoCount: files.length,
        durationMs: Date.now() - generationStartedAt,
      });
      if (isEntitlementCode(refusal.code)) {
        trackEvent("paywall_viewed", { source: "capture_generate", reason: refusal.code });
      }
      // The draft text, photos, and photo facts are left untouched on purpose.
      toast.error(refusal.message || "Generation failed. Please try again.");
      setGenerating(false);
      return;
    }

    if (!result) {
      trackEvent("personal_story_generate_failed", {
        reason: "generation_failed",
        photoCount: files.length,
        durationMs: Date.now() - generationStartedAt,
      });
      toast.error(language === "zh" ? "生成失败，请稍后再试。" : "Generation failed. Please try again.");
      setGenerating(false);
      return;
    }

    if (result.tags) result.tags = filterAbstractTags(result.tags);

    const finalMemory: Memory = {
      ...emptyMemory(),
      ...baseMeta,
      title: result.title || "",
      story: result.story || "",
      tags: result.tags || [],
      ai: result.ai || { source: "local" },
      factualSummary: moment.trim(),
      people: [],
      _aiStory: result.story || "",
      _aiTags: (result.tags || []).slice(),
    };
    setMemory(finalMemory);
    setSavedState("idle");
    setGenerating(false);
    trackEvent("personal_story_generated", {
      provider: finalMemory.ai?.source || "unknown",
      model: finalMemory.ai?.model || "unknown",
      photoCount: files.length,
      durationMs: Date.now() - generationStartedAt,
    });
  }

  async function handleSave() {
    if (!memory) return;
    if (!factsConfirmed) {
      toast.error("Confirm the facts before saving this trace.");
      return;
    }
    setSaving(true);
    if (user) {
      let photoKeys = memory.photoKeys;
      let coverPhotoKey = memory.coverPhotoKey;
      if (files.length && photoKeys.length === 0) {
        try {
          const prepared: PreparedPhoto[] = [];
          for (const file of files) prepared.push(await preparePhoto(file));
          const uploaded = await uploadPhotos(prepared.map((photo) => photo.uploadFile));
          photoKeys = uploaded.map((photo) => photo.key);
          coverPhotoKey = photoKeys[0] || null;
          setMemory((current) =>
            current
              ? {
                  ...current,
                  photoKeys,
                  photoUrls: uploaded.map((photo) => photo.url),
                  coverPhotoKey,
                  coverPhotoUrl: uploaded[0]?.url || null,
                }
              : current,
          );
        } catch (thrown) {
          setSaving(false);
          const detail = thrown instanceof Error && thrown.message !== "media_upload_failed" ? thrown.message : "";
          toast.error(detail || "Your photos could not be uploaded. The trace has not been saved.");
          return;
        }
      }
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: memory.title,
          story: memory.story,
          place: memory.place,
          mood: memory.mood,
          tags: memory.tags,
          photoKeys,
          coverPhotoKey,
          isPublic: false,
          eventAt: memory.eventAt,
          datePrecision: memory.datePrecision,
          factualSummary: memory.factualSummary,
          people: memory.people,
          latitude: memory.latitude,
          longitude: memory.longitude,
          factsConfirmed: true,
          ai: memory.ai,
        }),
      });
      const data = await res.json().catch(() => null);
      setSaving(false);
      if (data?.ok) {
        setSavedState("cloud");
        await clearCaptureDraft();
        window.sessionStorage.removeItem("triptrace-pending-draft");
        if (data.memory?.isFirstTrace) {
          trackEvent("first_atlas_saved", {
            photoCount: photoKeys.length,
            hasText: Boolean(memory.factualSummary?.trim()),
            hasDate: Boolean(memory.eventAt),
            hasCoordinates: memory.latitude != null && memory.longitude != null,
          });
        }
        toast.success(language === "zh" ? "已保存到旅迹库 ☁" : "Saved to your vault ☁");
      } else {
        const code = String(data?.error?.code || "");
        if (isEntitlementCode(code)) {
          trackEvent("paywall_viewed", { source: "capture_save", reason: code });
        }
        // The draft stays on screen so a limit message never costs the user their work.
        toast.error(
          data?.error?.message ||
            (language === "zh" ? "保存失败，请稍后再试。" : "Save failed. Please try again."),
        );
      }
      return;
    }

    try {
      window.sessionStorage.setItem(
        "triptrace-pending-draft",
        JSON.stringify({
          hasDraft: true,
          title: memory.title,
          story: memory.story,
        }),
      );
      setSavedState("local");
      window.dispatchEvent(new Event("triptrace:open-account"));
      toast.message("Sign in or create an account to save this trace privately.");
    } catch {
      toast.error(language === "zh" ? "保存失败。" : "Save failed.");
    }
    setSaving(false);
  }

  async function handleDownload() {
    if (!memory) return;
    try {
      await downloadMemoryPoster(memory, {
        moodLabel: moodLabel(memory.mood),
        language,
        isDark: resolvedTheme === "dark",
      });
    } catch {
      toast.error(language === "zh" ? "图片导出失败，请稍后再试。" : "Image export failed. Please try again.");
    }
  }

  async function handleCopy() {
    if (!memory) return;
    const lines = [memory.title, memory.story, [memory.place, moodLabel(memory.mood)].filter(Boolean).join(" · "), memory.tags.join(language === "zh" ? "、" : ", ")].filter(Boolean);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(t("generated.copy"));
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Create one memory trace
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span><strong className="text-foreground">1.</strong> Add a real moment</span>
          <span><strong className="text-foreground">2.</strong> AI drafts the story</span>
          <span><strong className="text-foreground">3.</strong> You confirm the facts</span>
          <span><strong className="text-foreground">4.</strong> Save it privately</span>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <p className="font-serif text-2xl font-semibold">Start with what you know</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            A sentence or photo is enough. Details can stay blank when you do not know them.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="moment">{t("capture.momentLabel")}</Label>
          <Textarea
            id="moment"
            rows={6}
            placeholder={t("capture.momentPlaceholder")}
            value={moment}
            onChange={(e) => {
              const nextValue = e.target.value;
              setMoment(nextValue);
              if (nextValue.trim() && !textEnteredRef.current) {
                textEnteredRef.current = true;
                markDemoStarted("text");
                trackEvent("personal_text_entered", {
                  source: "capture_panel",
                  lengthBucket: nextValue.length < 80 ? "short" : "long",
                });
              }
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="place">{t("capture.placeLabel")}</Label>
            <Input
              id="place"
              placeholder={t("capture.placeDefault")}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("capture.moodLabel")}</Label>
            <Select value={mood} onValueChange={(v) => setMood(v as MoodKey)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOOD_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {moodLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("capture.uploadTitle")}</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={generating || saving || files.length >= MAX_PHOTOS}
            className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {files.length >= MAX_PHOTOS
              ? `${MAX_PHOTOS} photos selected · limit reached`
              : files.length
                ? `${files.length} ${files.length === 1 ? "photo" : "photos"} selected · add more`
                : t("capture.uploadTitle")}
          </button>
          <p className="text-xs text-muted-foreground">{t("capture.uploadHint")}</p>
          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pt-1">
              {previews.map((src, i) => (
                <div
                  key={`${files[i]?.name || "photo"}-${i}`}
                  className="group relative h-20 w-20 shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full rounded-xl border border-border object-cover"
                  />
                  {savedState !== "cloud" && (
                    <button
                      type="button"
                      aria-label={`Remove ${files[i]?.name || `photo ${i + 1}`}`}
                      title="Remove photo"
                      disabled={generating || saving}
                      onClick={() => void handleRemovePhoto(i)}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-black/70 text-white shadow-sm transition hover:scale-105 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {(exifScanning || exifCandidate || confirmedEventDate || latitude !== null || longitude !== null) && (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Photo facts
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {exifScanning
                      ? "Reading local photo metadata..."
                      : exifCandidate
                        ? `Detected from ${exifCandidate.filename}`
                        : "No EXIF metadata detected yet."}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="exif-date">Event date</Label>
                  <Input
                    id="exif-date"
                    type="date"
                    value={confirmedEventDate}
                    onChange={(event) => {
                      setConfirmedEventDate(event.target.value);
                      updateDraft({
                        eventAt: toIsoDate(event.target.value),
                        datePrecision: event.target.value ? "day" : "unknown",
                      });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exif-latitude">Latitude</Label>
                  <Input
                    id="exif-latitude"
                    inputMode="decimal"
                    placeholder="Unknown"
                    value={latitudeInput}
                    onChange={(event) => {
                      setLatitudeInput(event.target.value);
                      const value = parseCoordinateInput(event.target.value);
                      setLatitude(value);
                      updateDraft({ latitude: value });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exif-longitude">Longitude</Label>
                  <Input
                    id="exif-longitude"
                    inputMode="decimal"
                    placeholder="Unknown"
                    value={longitudeInput}
                    onChange={(event) => {
                      setLongitudeInput(event.target.value);
                      const value = parseCoordinateInput(event.target.value);
                      setLongitude(value);
                      updateDraft({ longitude: value });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {aiConfigured === false && (
          <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-foreground">
            <strong>Local AI setup is missing.</strong> Add `OPENAI_API_KEY` to `.dev.vars` and restart the development server to test real AI. You can still inspect a clearly labeled fallback draft.
          </p>
        )}

        <Button type="submit" disabled={generating || (!moment.trim() && files.length === 0)} className="w-full">
          {generating ? t("capture.generating") : t("capture.generate")}
        </Button>
      </form>

      <div className="self-start rounded-2xl border border-border bg-card p-6">
        {!memory ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Next</span>
            <p className="mt-3 font-serif text-2xl font-semibold">
              Your AI story draft appears here
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              TripTrace analyzes up to four representative photos, drafts a title and story, then asks you to verify the real date, place, and people before saving.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                Review your draft
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Edit the writing, confirm only the facts you know, then keep this trace in your private Atlas.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="draft-title">Title</Label>
                <Input
                  id="draft-title"
                  value={memory.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-story">Story draft</Label>
                <Textarea
                  id="draft-story"
                  rows={7}
                  value={memory.story}
                  onChange={(event) => updateDraft({ story: event.target.value })}
                />
              </div>
            </div>
            <DraftPhotoGallery
              urls={memory.photoUrls.length ? memory.photoUrls : memory.coverPhotoUrl ? [memory.coverPhotoUrl] : []}
            />
            {memory.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {memory.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="confirmed-place">Confirmed place</Label>
                <Input
                  id="confirmed-place"
                  placeholder="Leave blank if unknown"
                  value={memory.place}
                  onChange={(event) => updateDraft({ place: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmed-date">Confirmed date</Label>
                <Input
                  id="confirmed-date"
                  type="date"
                  value={confirmedEventDate || toDateInputValue(memory.eventAt)}
                  onChange={(event) => {
                    setConfirmedEventDate(event.target.value);
                    updateDraft({
                      eventAt: toIsoDate(event.target.value),
                      datePrecision: event.target.value ? "day" : "unknown",
                    });
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="confirmed-latitude">Latitude</Label>
                <Input
                  id="confirmed-latitude"
                  inputMode="decimal"
                  placeholder="Leave blank if unknown"
                  value={latitudeInput}
                  onChange={(event) => {
                    setLatitudeInput(event.target.value);
                    const value = parseCoordinateInput(event.target.value);
                    setLatitude(value);
                    updateDraft({ latitude: value });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmed-longitude">Longitude</Label>
                <Input
                  id="confirmed-longitude"
                  inputMode="decimal"
                  placeholder="Leave blank if unknown"
                  value={longitudeInput}
                  onChange={(event) => {
                    setLongitudeInput(event.target.value);
                    const value = parseCoordinateInput(event.target.value);
                    setLongitude(value);
                    updateDraft({ longitude: value });
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmed-people">People</Label>
              <Input
                id="confirmed-people"
                placeholder="Names separated by commas; leave blank if unknown"
                value={(memory.people || []).join(", ")}
                onChange={(event) =>
                  updateDraft({
                    people: event.target.value
                      .split(",")
                      .map((person) => person.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            {memory.ai?.source === "openai" ? (
              <p className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {t("generated.sourceOpenAI")}
                {memory.ai.model ? ` · ${t("generated.sourceModel")}: ${memory.ai.model}` : ""}
                {files.length > 0
                  ? ` · ${Math.min(files.length, MAX_VISION_IMAGES)} ${Math.min(files.length, MAX_VISION_IMAGES) === 1 ? "photo" : "photos"} analyzed`
                  : ""}
              </p>
            ) : (
              <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-foreground">
                <strong>AI unavailable.</strong> {aiFallbackMessage(memory.ai?.reason)}
              </p>
            )}
            <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
              Narrative and facts stay separate. AI can draft the writing, but only you confirm what happened.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--tt-brand)]"
                checked={factsConfirmed}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setFactsConfirmed(checked);
                  if (checked) {
                    trackEvent("personal_fact_confirmed", {
                      hasDate: Boolean(memory.eventAt),
                      hasPlace: Boolean(memory.place.trim()),
                      hasPeople: Boolean(memory.people?.length),
                      hasCoordinates: memory.latitude != null && memory.longitude != null,
                    });
                  }
                }}
              />
              <span>
                I reviewed the date, place, people, title, and story. Blank fields mean I do not know them.
              </span>
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {t("generated.copy")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                {t("generated.download")}
              </Button>
              <Button size="sm" disabled={saving || !factsConfirmed} onClick={handleSave}>
                {savedState === "cloud"
                  ? t("generated.saved")
                  : savedState === "local" && !user
                    ? t("generated.signInAndSave")
                    : t("generated.save")}
              </Button>
            </div>
            {!user && savedState === "idle" && (
              <p className="text-xs text-muted-foreground">{t("generated.signInToSave")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
