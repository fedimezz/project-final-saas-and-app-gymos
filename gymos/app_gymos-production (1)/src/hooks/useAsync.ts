import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean; // true while there is NO data yet (first load, a changed `deps`, or a retry after a failed first load) — drives the skeleton
  refreshing: boolean; // true on pull-to-refresh / reload() when data already exists
  error: string | null;
  reload: () => void;
}

/**
 * Runs `fetcher` on mount and again whenever `deps` change.
 *
 * - `deps` changing is a NEW query (another week, another session): the old
 *   data is dropped so the screen shows its skeleton instead of stale data
 *   under the wrong heading.
 * - `reload()` keeps the last good data on screen and flips `refreshing`; if
 *   there is no data yet (the first load failed) it behaves like a fresh load.
 * - Only the most recent request may write state. Without that, tapping
 *   "next week" twice quickly could let the slower first response land last.
 * - Errors and data can coexist: a failed `reload()` sets `error` while the
 *   previous `data` stays available.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRequest = useRef(0);
  const hasData = useRef(false);
  // Always call the newest fetcher (it closes over the current deps), so
  // `run` itself never needs to be re-created.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher; // declared before the fetch effect below, so it is current when that runs
  });

  const run = useCallback(async (isRefresh: boolean) => {
    const requestId = ++latestRequest.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (requestId !== latestRequest.current) return;
      hasData.current = true;
      setData(result);
    } catch (e) {
      if (requestId !== latestRequest.current) return;
      setError(e instanceof ApiError ? e.message : "Impossible de charger les données. Vérifiez votre connexion.");
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    hasData.current = false;
    // Intentional: a changed `deps` is a NEW query, so the previous query's data must not
    // stay on screen (see the doc comment above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => {
    void run(hasData.current);
  }, [run]);

  return { data, loading, refreshing, error, reload };
}
