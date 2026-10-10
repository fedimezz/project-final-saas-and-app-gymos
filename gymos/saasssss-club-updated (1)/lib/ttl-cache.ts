// lib/ttl-cache.ts
//
// Tiny in-memory TTL cache with in-flight de-duplication. With a remote database every
// query costs a network round trip (hundreds of ms), so values that are read on every
// request but change rarely (club branding, "is this account still active") are kept for a
// few seconds. Concurrent requests for the same key share ONE query instead of each
// firing their own. Per server instance; writers call invalidate() so the instance that
// handled the write is immediately fresh, others converge within the TTL.
type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private ttlMs: number, private maxEntries = 500) {}

  async get(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = loader()
      .then((value) => {
        if (this.store.size >= this.maxEntries) {
          const oldest = this.store.keys().next().value;
          if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
