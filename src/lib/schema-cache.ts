/**
 * Schema Cache for Database Explorer
 * Caches database metadata queries to reduce load and improve performance.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class SchemaCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 60000; // 1 minute default TTL

  /**
   * Get cached data or fetch it using the provided fetcher function
   * @param key - Cache key (should be unique per query)
   * @param fetcher - Async function to fetch data if not cached
   * @param ttl - Optional custom TTL in milliseconds
   */
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const ttlMs = ttl ?? this.DEFAULT_TTL;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param pattern - Pattern to match (simple substring match)
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for a specific connection
   */
  invalidateConnection(connectionId: string): void {
    this.invalidate(`conn:${connectionId}`);
  }

  /**
   * Invalidate cache for a specific database
   */
  invalidateDatabase(connectionId: string, database: string): void {
    this.invalidate(`conn:${connectionId}:db:${database}`);
  }

  /**
   * Invalidate cache for a specific schema
   */
  invalidateSchema(connectionId: string, database: string, schema: string): void {
    this.invalidate(`conn:${connectionId}:db:${database}:schema:${schema}`);
  }

  /**
   * Build a cache key for a query
   */
  static buildKey(connectionId: string, database: string, schema?: string, category?: string): string {
    const parts = [`conn:${connectionId}`, `db:${database}`];
    if (schema) parts.push(`schema:${schema}`);
    if (category) parts.push(`cat:${category}`);
    return parts.join(':');
  }

  /**
   * Get cache stats for debugging
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton instance for use across the application
let schemaCacheInstance: SchemaCache | null = null;

export function getSchemaCache(): SchemaCache {
  if (!schemaCacheInstance) {
    schemaCacheInstance = new SchemaCache();
  }
  return schemaCacheInstance;
}
