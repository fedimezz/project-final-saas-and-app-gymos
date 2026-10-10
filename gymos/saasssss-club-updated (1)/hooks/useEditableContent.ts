"use client";

import { useState, useEffect, useCallback } from "react";

export function useEditableContent(pageKey: string) {
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/content/public/${encodeURIComponent(pageKey)}`, {
        cache: "no-store",
        signal,
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.content && typeof json.content === "object") setContent(json.content);
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") console.error("Editable content load failed:", error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // The admin preview saves through the same app, so allow it to explicitly
  // invalidate the public content cache without requiring a hard refresh.
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("page-content-updated", refresh);
    return () => window.removeEventListener("page-content-updated", refresh);
  }, [load]);

  const t = useCallback((key: string, fallback: string) => {
    const value = content[key];
    return value && value.trim() ? value : fallback;
  }, [content]);

  const list = useCallback((key: string, fallback: string[]): string[] => {
    const value = content[key];
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
    } catch {
      return fallback;
    }
  }, [content]);

  return { t, img: t, list, content, loading };
}
