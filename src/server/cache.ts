/**
 * TTL Cache with optional LRU eviction and request coalescing
 *
 * Used across proxy routes to:
 * - Prevent upstream rate-limit exhaustion (Blocklist #8)
 * - Coalesce concurrent identical requests
 */

export interface TTLCacheOptions<K, V> {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Maximum entries (enables LRU eviction when set) */
  maxSize?: number;
  /** Optional callback when entry expires */
  onExpire?: (key: K, value: V) => void;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Generic TTL cache with optional LRU eviction
 */
export class TTLCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private readonly ttl: number;
  private readonly maxSize?: number;
  private readonly onExpire?: (key: K, value: V) => void;

  constructor(options: TTLCacheOptions<K, V>) {
    this.ttl = options.ttl;
    this.maxSize = options.maxSize;
    this.onExpire = options.onExpire;
  }

  /**
   * Get a cached value, returns undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.onExpire?.(key, entry.value);
      return undefined;
    }

    // LRU: Move to end on access (Map maintains insertion order)
    if (this.maxSize) {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }

    return entry.value;
  }

  /**
   * Set a cached value with TTL
   */
  set(key: K, value: V, customTtl?: number): void {
    // LRU eviction if at capacity
    if (this.maxSize && this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const entry = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        if (entry) this.onExpire?.(oldestKey, entry.value);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (customTtl ?? this.ttl),
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a cached entry
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.onExpire?.(key, entry.value);
      return true;
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    if (this.onExpire) {
      this.cache.forEach((entry, key) => {
        this.onExpire!(key, entry.value);
      });
    }
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries (call periodically if needed)
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.onExpire?.(key, entry.value);
        pruned++;
      }
    });

    return pruned;
  }
}

/**
 * Request coalescing - prevents duplicate in-flight requests
 *
 * If a fetch is already in-flight for a key, return the same promise
 * instead of starting a new request. This prevents upstream rate-limit
 * exhaustion when multiple clients request the same data simultaneously.
 */
export class RequestCoalescer<K, V> {
  private pending: Map<K, Promise<V>> = new Map();

  /**
   * Coalesce requests for the same key
   *
   * @param key - Cache key
   * @param fetcher - Async function to fetch the value
   * @returns Promise resolving to the fetched value
   */
  async coalesce(key: K, fetcher: () => Promise<V>): Promise<V> {
    // Check if request is already in flight
    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }

    // Start new request
    const promise = fetcher().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Check if a request is currently in flight
   */
  isPending(key: K): boolean {
    return this.pending.has(key);
  }

  /**
   * Get count of pending requests
   */
  get pendingCount(): number {
    return this.pending.size;
  }
}

/**
 * Combined TTL cache with request coalescing
 *
 * Provides both caching and deduplication of in-flight requests.
 */
export class CachedFetcher<K extends string | number, V> {
  private cache: TTLCache<K, V>;
  private coalescer: RequestCoalescer<K, V>;

  constructor(options: TTLCacheOptions<K, V>) {
    this.cache = new TTLCache(options);
    this.coalescer = new RequestCoalescer();
  }

  /**
   * Get cached value or fetch it
   *
   * @param key - Cache key
   * @param fetcher - Async function to fetch the value if not cached
   * @returns Promise resolving to the cached or fetched value
   */
  async getOrFetch(key: K, fetcher: () => Promise<V>): Promise<V> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch with coalescing
    const value = await this.coalescer.coalesce(key, fetcher);

    // Cache the result
    this.cache.set(key, value);

    return value;
  }

  /**
   * Invalidate a cached entry
   */
  invalidate(key: K): void {
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  get stats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.coalescer.pendingCount,
    };
  }
}
