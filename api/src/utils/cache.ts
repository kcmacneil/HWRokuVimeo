interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Minimal in-memory TTL cache. On Vercel each warm lambda instance keeps its
 * own cache, which is fine for metadata: it only reduces Vimeo calls, it is
 * never the source of truth.
 */
export class TtlCache<T = unknown> {
  private store = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<T>>();

  constructor(private readonly defaultTtlMs: number, private readonly maxEntries = 500) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (ttlMs <= 0) return;
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Get-or-compute with request coalescing so concurrent misses hit Vimeo once. */
  async wrap(key: string, fn: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const p = fn()
      .then((v) => {
        this.set(key, v, ttlMs);
        return v;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  clear(): void {
    this.store.clear();
    this.pending.clear();
  }
}
