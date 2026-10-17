// lib/public-fetch.ts — browser-side GET helper for the public endpoints.
//
// The homepage mounts several sections at once and more than one of them (or the same
// section mounted twice by React strict mode) asks for the same URL. This shares ONE
// request between them and remembers the answer for a few seconds, so navigating between
// public pages is instant and the database is not hit repeatedly.
// Callers keep their own "cancelled" flag: the shared request is never aborted by one consumer.
const MEMO_MS = 4_000;

const inflight = new Map<string, Promise<unknown>>();
const memo = new Map<string, { at: number; value: unknown }>();

export function fetchPublicJson<T = unknown>(url: string, opts: { force?: boolean } = {}): Promise<T> {
  if (!opts.force) {
    const hit = memo.get(url);
    if (hit && Date.now() - hit.at < MEMO_MS) return Promise.resolve(hit.value as T);
    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const promise = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const value = (await res.json()) as T;
      memo.set(url, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      if (inflight.get(url) === promise) inflight.delete(url);
    });
  inflight.set(url, promise);
  return promise;
}

/** Forget remembered answers (e.g. after the admin preview saved something). */
export function clearPublicFetchCache(url?: string): void {
  if (url) memo.delete(url);
  else memo.clear();
}
