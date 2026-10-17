// lib/public-cache.ts
//
// Stale-while-revalidate cache for the PUBLIC (visitor-facing) endpoints: plans, coaches,
// weekly schedule, promotions, page content. With a remote database every query is a
// network round trip (300 ms – 1.5 s), and one homepage view fires 6–8 of these endpoints
// (twice in React dev strict mode). So:
//   - fresh for FRESH_MS            → served from memory, no query at all;
//   - stale up to STALE_MS          → served instantly while ONE background query refreshes it;
//   - concurrent misses share ONE query (in-flight de-duplication).
// Entries are keyed per club (tenants never share a value). A failed load is never cached.
// Writers call invalidatePublicCache(clubId) so the owner sees their own change at once;
// other server instances converge within FRESH_MS.
type Entry = { value: unknown; freshUntil: number; staleUntil: number };

const FRESH_MS = 5_000;
const STALE_MS = 60_000;
const MAX_ENTRIES = 800;

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function load<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = loader()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      const now = Date.now();
      store.delete(key); // re-insert: this key becomes the newest
      store.set(key, { value, freshUntil: now + FRESH_MS, staleUntil: now + STALE_MS });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export async function cachedPublic<T>(clubId: string, name: string, loader: () => Promise<T>): Promise<T> {
  const key = `${clubId}|${name}`;
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.freshUntil > now) return hit.value as T;
  if (hit && hit.staleUntil > now) {
    // Serve the stale copy now; refresh behind the scenes (errors are ignored: the next call retries).
    void load(key, loader).catch(() => {});
    return hit.value as T;
  }
  return load(key, loader);
}

/** Call after any admin write that changes what visitors see for this club. */
export function invalidatePublicCache(clubId: string): void {
  const prefix = `${clubId}|`;
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

/** Test helper. */
export function clearPublicCache(): void {
  store.clear();
  inflight.clear();
}
