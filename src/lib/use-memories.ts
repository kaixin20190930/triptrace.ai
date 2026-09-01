"use client";

import { useState, useEffect, useCallback } from "react";
import type { Memory } from "@/lib/memory-types";

export type { Memory } from "@/lib/memory-types";

export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memories?own=true");
      const data = await res.json();
      const remote: Memory[] = res.ok ? (data.memories ?? []) : [];

      const sorted = remote.sort(
        (a, b) =>
          new Date(b.eventAt || b.createdAt || 0).getTime() -
          new Date(a.eventAt || a.createdAt || 0).getTime()
      );
      setMemories(sorted);
    } catch {
      setMemories([]);
      setError("offline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    window.addEventListener("triptrace:memories-updated", refresh);
    return () => window.removeEventListener("triptrace:memories-updated", refresh);
  }, [refresh]);

  return { memories, loading, error, refresh };
}
