"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchPublicJson } from "@/lib/public-fetch";

export function useEditableContent(pageKey: string) {
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // `force` bypasses the short-lived shared answer (used after the admin preview saved).
  const load = useCallback(async (signal?: AbortSignal, force = false) => {
    try {
      const json = await fetchPublicJson<{ content?: Record<string, string> }>(
        `/api/content/public/${encodeURIComponent(pageKey)}`,
        { force }
      );
      if (signal?.aborted) return;
      if (json?.content && typeof json.content === "object") setContent(json.content);
    } catch (error) {
      if (!signal?.aborted) console.error("Editable content load failed:", error);
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
    const refresh = () => load(undefined, true);
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
