"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n";
import { fetchMemoryStream, filterAbstractTags, type GenerateInput } from "@/lib/generate";
import { downloadMemoryPoster } from "@/lib/poster";
import { getTodayLabel } from "@/lib/format";
import type { Memory, GenerateResult } from "@/lib/memory-types";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MOOD_KEYS = ["calm", "happy", "moved", "relaxed", "lost"] as const;
type MoodKey = (typeof MOOD_KEYS)[number];

type UploadedPhoto = { key: string; url: string; filename: string };

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

export function CapturePanel() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();

  const [moment, setMoment] = React.useState("");
  const [place, setPlace] = React.useState("");
  const [mood, setMood] = React.useState<MoodKey>("calm");
  const [files, setFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [generating, setGenerating] = React.useState(false);
  const [memory, setMemory] = React.useState<Memory | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedState, setSavedState] = React.useState<"idle" | "cloud" | "local">("idle");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function moodLabel(key: string) {
    return t(`mood.${key}`);
  }

  function handleFilesSelected(selected: FileList | null) {
    if (!selected) return;
    const arr = Array.from(selected).slice(0, 6);
    setFiles(arr);
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
  }

  async function uploadPhotos(selected: File[]): Promise<UploadedPhoto[]> {
    const formData = new FormData();
    selected.forEach((file) => formData.append("photos", file));
    const res = await fetch("/api/media", { method: "POST", body: formData });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error?.message || "media_upload_failed");
    return data.files as UploadedPhoto[];
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!moment.trim()) return;

    setGenerating(true);
    setSavedState("idle");

    const payload: GenerateInput = {
      moment: moment.trim(),
      place: place.trim(),
      mood,
      moodLabel: moodLabel(mood),
    };

    let uploaded: UploadedPhoto[] = [];
    try {
      if (user && files.length) {
        uploaded = await uploadPhotos(files);
      }
    } catch {
      toast.error(language === "zh" ? "照片上传失败，先生成不带图的卡片。" : "Photo upload failed; generating without images.");
    }

    const photoKeys = uploaded.map((p) => p.key);
    const photoUrls = uploaded.length ? uploaded.map((p) => p.url) : previews;
    const baseMeta = {
      place: payload.place || "",
      mood: payload.mood || "calm",
      photoKeys,
      photoUrls,
      coverPhotoKey: photoKeys[0] || null,
      coverPhotoUrl: photoUrls[0] || null,
      date: getTodayLabel(),
    };

    let result: GenerateResult | null = null;
    try {
      const streamTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
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
    } catch {
      result = null;
    }

    if (!result) {
      try {
        const res = await fetch("/api/generate-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = res.ok ? await res.json() : null;
      } catch {
        result = null;
      }
    }

    if (!result) {
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
      _aiStory: result.story || "",
      _aiTags: (result.tags || []).slice(),
    };
    setMemory(finalMemory);
    setGenerating(false);
  }

  async function handleSave() {
    if (!memory) return;
    setSaving(true);
    if (user) {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: memory.title,
          story: memory.story,
          place: memory.place,
          mood: memory.mood,
          tags: memory.tags,
          photoKeys: memory.photoKeys,
          coverPhotoKey: memory.coverPhotoKey,
          isPublic: false,
        }),
      });
      const data = await res.json().catch(() => null);
      setSaving(false);
      if (data?.ok) {
        setSavedState("cloud");
        toast.success(language === "zh" ? "已保存到旅迹库 ☁" : "Saved to your vault ☁");
      } else {
        toast.error(language === "zh" ? "保存失败，请稍后再试。" : "Save failed. Please try again.");
      }
      return;
    }

    // Anonymous: persist to localStorage so the Vault page (Session 3) can read it.
    try {
      const existing = JSON.parse(window.localStorage.getItem("triptrace-memories") || "[]");
      const list = Array.isArray(existing) ? existing : [];
      window.localStorage.setItem("triptrace-memories", JSON.stringify([memory, ...list]));
      setSavedState("local");
      toast.success(t("generated.savedLocal"));
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
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleGenerate} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-1.5">
          <Label htmlFor="moment">{t("capture.momentLabel")}</Label>
          <Textarea
            id="moment"
            rows={6}
            placeholder={t("capture.momentPlaceholder")}
            value={moment}
            onChange={(e) => setMoment(e.target.value)}
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
            className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary"
          >
            {files.length ? `${files.length} 张照片已选择` : t("capture.uploadTitle")}
          </button>
          <p className="text-xs text-muted-foreground">{t("capture.uploadHint")}</p>
          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pt-1">
              {previews.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>

        <Button type="submit" disabled={generating || !moment.trim()} className="w-full">
          {generating ? t("capture.generating") : t("capture.generate")}
        </Button>
      </form>

      <div className="rounded-2xl border border-border bg-card p-6">
        {!memory ? (
          <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
            {language === "zh" ? "生成结果会显示在这里" : "Your generated memory will appear here"}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-serif text-xl font-bold">{memory.title || "…"}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{memory.story || "…"}</p>
            </div>
            {memory.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {memory.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {memory.ai?.source === "openai" ? t("generated.sourceOpenAI") : t("generated.sourceMock")}
              {memory.ai?.model ? ` · ${t("generated.sourceModel")}: ${memory.ai.model}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {t("generated.copy")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                {t("generated.download")}
              </Button>
              <Button size="sm" disabled={saving} onClick={handleSave}>
                {savedState === "idle" ? t("generated.save") : t("generated.saved")}
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
