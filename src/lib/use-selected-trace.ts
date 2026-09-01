"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Memory } from "@/lib/memory-types";

const TRACE_SELECTION_EVENT = "triptrace:trace-selection";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(TRACE_SELECTION_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(TRACE_SELECTION_EVENT, callback);
  };
}

function getSnapshot() {
  return window.location.search;
}

function getServerSnapshot() {
  return "";
}

export function useSelectedTrace(memories: Memory[]) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selectedId = useMemo(() => new URLSearchParams(search).get("trace"), [search]);

  const selected = useMemo(
    () =>
      (selectedId && memories.find((memory) => memory.id === selectedId)) ||
      memories[0] ||
      null,
    [memories, selectedId],
  );

  const selectTrace = useCallback(
    (id: string | null | undefined) => {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      if (id) params.set("trace", id);
      else params.delete("trace");
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new Event(TRACE_SELECTION_EVENT));
    },
    [],
  );

  return { selected, selectedId, selectTrace };
}
