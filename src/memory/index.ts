/**
 * Lobster Memory System — Three-tier architecture
 * 
 * claw-code-rust has NO memory system. This is our key differentiator.
 * 
 * Architecture:
 * - HOT: current session, in-memory, LRU eviction (max 100 items)
 * - WARM: last 7 days, persisted to disk, important items only
 * - COLD: archive, everything, searchable
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  importance: 'high' | 'medium' | 'low';
  createdAt: number; // unix ms
  accessedAt: number;
  tags: string[];
  accessCount: number;
}

export interface MemoryQuery {
  key?: string;
  tags?: string[];
  since?: number; // unix ms
  importance?: 'high' | 'medium' | 'low';
  limit?: number;
}

/**
 * HOT Memory — current session, in-memory LRU cache
 */
export class HotMemory {
  private store = new Map<string, MemoryItem>();
  private maxItems: number;
  private sessionId: string;

  constructor(maxItems = 100, sessionId = 'default') {
    this.maxItems = maxItems;
    this.sessionId = sessionId;
  }

  set(key: string, value: string, importance: 'high' | 'medium' | 'low' = 'medium', tags: string[] = []): void {
    const existing = this.store.get(key);
    this.evictIfNeeded();
    
    this.store.set(key, {
      id: existing?.id || `hot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      key,
      value,
      importance,
      tags,
      createdAt: existing?.createdAt || Date.now(),
      accessedAt: Date.now(),
      accessCount: (existing?.accessCount || 0) + 1,
    });
  }

  get(key: string): string | undefined {
    const item = this.store.get(key);
    if (item) {
      item.accessedAt = Date.now();
      item.accessCount++;
    }
    return item?.value;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  query(q: MemoryQuery): MemoryItem[] {
    let results = Array.from(this.store.values());
    
    if (q.key) {
      results = results.filter(i => i.key.includes(q.key!));
    }
    if (q.tags?.length) {
      results = results.filter(i => q.tags!.some(t => i.tags.includes(t)));
    }
    if (q.since) {
      results = results.filter(i => i.createdAt >= q.since!);
    }
    if (q.importance) {
      results = results.filter(i => i.importance === q.importance);
    }
    
    return results
      .sort((a, b) => b.accessedAt - a.accessedAt)
      .slice(0, q.limit || 50);
  }

  all(): MemoryItem[] {
    return Array.from(this.store.values())
      .sort((a, b) => b.accessedAt - a.accessedAt);
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  private evictIfNeeded(): void {
    if (this.store.size >= this.maxItems) {
      // Evict least recently accessed low-importance item
      const candidates = Array.from(this.store.values())
        .filter(i => i.importance === 'low')
        .sort((a, b) => a.accessedAt - b.accessedAt);
      
      if (candidates.length > 0) {
        this.store.delete(candidates[0].key);
      } else {
        // Evict oldest medium item
        const mediums = Array.from(this.store.values())
          .filter(i => i.importance === 'medium')
          .sort((a, b) => a.accessedAt - b.accessedAt);
        if (mediums.length > 0) {
          this.store.delete(mediums[0].key);
        }
      }
    }
  }
}

/**
 * WARM Memory — persisted to disk, last 7 days, important items
 */
export class WarmMemory {
  private dir: string;
  private store = new Map<string, MemoryItem>();
  private ttl: number; // 7 days in ms

  constructor(dir: string = './memory/warm', ttlDays = 7) {
    this.dir = dir;
    this.ttl = ttlDays * 24 * 60 * 60 * 1000;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.load();
  }

  private filePath(key: string): string {
    // Hash key to filename to avoid filesystem issues
    const hash = Buffer.from(key).toString('base64url').slice(0, 32);
    return join(this.dir, `${hash}.json`);
  }

  private async load(): Promise<void> {
    try {
      const files = await readdir(this.dir);
      const now = Date.now();
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await readFile(join(this.dir, file), 'utf-8');
          const item: MemoryItem = JSON.parse(content);
          
          // Evict expired items
          if (now - item.createdAt > this.ttl) {
            await unlink(join(this.dir, file)).catch(() => {});
            continue;
          }
          
          this.store.set(item.key, item);
        } catch {
          // Corrupted file, skip
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  async set(key: string, value: string, importance: 'high' | 'medium' | 'low' = 'medium', tags: string[] = []): Promise<void> {
    const item: MemoryItem = {
      id: `warm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      key,
      value,
      importance,
      tags,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 1,
    };

    this.store.set(key, item);
    await writeFile(this.filePath(key), JSON.stringify(item), 'utf-8');
  }

  async get(key: string): Promise<string | undefined> {
    const item = this.store.get(key);
    if (item) {
      item.accessedAt = Date.now();
      item.accessCount++;
      await writeFile(this.filePath(key), JSON.stringify(item), 'utf-8').catch(() => {});
      return item.value;
    }
    return undefined;
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async query(q: MemoryQuery): Promise<MemoryItem[]> {
    let results = Array.from(this.store.values());
    
    if (q.key) {
      results = results.filter(i => i.key.includes(q.key!));
    }
    if (q.tags?.length) {
      results = results.filter(i => q.tags!.some(t => i.tags.includes(t)));
    }
    if (q.since) {
      results = results.filter(i => i.createdAt >= q.since!);
    }
    if (q.importance) {
      results = results.filter(i => i.importance === q.importance);
    }
    
    return results
      .sort((a, b) => b.accessedAt - a.accessedAt)
      .slice(0, q.limit || 50);
  }

  async size(): Promise<number> {
    return this.store.size;
  }

  async promote(key: string, value: string): Promise<void> {
    // Move from warm to hot by re-setting
    await this.set(key, value, 'high');
  }

  async demote(key: string, value: string): Promise<void> {
    // Move from warm to cold by archiving
    await this.set(key, value, 'low');
  }
}

/**
 * COLD Memory — archive, everything, compressed
 */
export class ColdMemory {
  private dir: string;
  private index = new Map<string, { file: string; offset: number; size: number }>();

  constructor(dir: string = './memory/cold') {
    this.dir = dir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.buildIndex();
  }

  private async buildIndex(): Promise<void> {
    this.index.clear();
    try {
      const files = await readdir(this.dir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const items = await this.loadFile(join(this.dir, file));
        for (const item of items) {
          this.index.set(item.key, { file, offset: 0, size: 0 });
        }
      }
    } catch {
      // No files yet
    }
  }

  private async loadFile(path: string): Promise<MemoryItem[]> {
    try {
      const content = await readFile(path, 'utf-8');
      return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  async append(item: MemoryItem): Promise<void> {
    const file = join(this.dir, `archive_${Date.now()}.jsonl`);
    const line = JSON.stringify(item) + '\n';
    await writeFile(file, line, { flag: 'a', encoding: 'utf-8' });
    this.index.set(item.key, { file, offset: 0, size: item.value.length });
  }

  async query(q: MemoryQuery): Promise<MemoryItem[]> {
    // For cold storage, we search by scanning files
    // In production, use a proper search index (Meilisearch/Lunr)
    const results: MemoryItem[] = [];
    
    if (!q.key && !q.tags && !q.since) {
      return results;
    }

    try {
      const files = await readdir(this.dir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const items = await this.loadFile(join(this.dir, file));
        for (const item of items) {
          let match = true;
          if (q.key && !item.key.includes(q.key)) match = false;
          if (q.tags?.length && !q.tags.some(t => item.tags.includes(t))) match = false;
          if (q.since && item.createdAt < q.since) match = false;
          if (q.importance && item.importance !== q.importance) match = false;
          if (match) results.push(item);
        }
      }
    } catch {
      // Empty
    }

    return results.slice(0, q.limit || 50);
  }
}

/**
 * Unified Memory Manager — the main interface
 */
export class MemoryManager {
  hot: HotMemory;
  warm: WarmMemory;
  cold: ColdMemory;

  constructor(options: {
    sessionId?: string;
    hotMax?: number;
    warmDir?: string;
    coldDir?: string;
  } = {}) {
    this.hot = new HotMemory(options.hotMax || 100, options.sessionId || 'default');
    this.warm = new WarmMemory(options.warmDir || './memory/warm');
    this.cold = new ColdMemory(options.coldDir || './memory/cold');
  }

  async init(): Promise<void> {
    await this.warm.init();
    await this.cold.init();
  }

  /**
   * Store a memory item. Decides which tier based on importance.
   */
  async store(
    key: string,
    value: string,
    importance: 'high' | 'medium' | 'low' = 'medium',
    tags: string[] = []
  ): Promise<void> {
    switch (importance) {
      case 'high':
        this.hot.set(key, value, importance, tags);
        await this.warm.set(key, value, importance, tags);
        break;
      case 'medium':
        this.hot.set(key, value, importance, tags);
        await this.warm.set(key, value, importance, tags);
        break;
      case 'low':
        // Low importance: demote old warm items to cold
        const oldValue = this.hot.get(key);
        if (oldValue) {
          await this.cold.append({
            id: `cold_${Date.now()}`,
            key,
            value: oldValue,
            importance: 'low',
            tags,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 0,
          });
          this.hot.delete(key);
        }
        break;
    }
  }

  /**
   * Retrieve from the best available tier
   */
  async recall(key: string): Promise<string | undefined> {
    // Try hot first
    const hot = this.hot.get(key);
    if (hot !== undefined) return hot;

    // Try warm
    const warm = await this.warm.get(key);
    if (warm !== undefined) {
      // Promote to hot
      this.hot.set(key, warm, 'medium');
      return warm;
    }

    // Try cold
    const coldResults = await this.cold.query({ key, limit: 1 });
    if (coldResults.length > 0) {
      const item = coldResults[0];
      // Promote to warm
      await this.warm.set(key, item.value, item.importance, item.tags);
      return item.value;
    }

    return undefined;
  }

  /**
   * Search across all tiers
   */
  async search(q: MemoryQuery): Promise<MemoryItem[]> {
    const [hot, warm, cold] = await Promise.all([
      Promise.resolve(this.hot.query(q)),
      this.warm.query(q),
      this.cold.query(q),
    ]);

    // Merge and dedupe by key, preferring hot > warm > cold
    const seen = new Set<string>();
    const results: MemoryItem[] = [];

    for (const item of [...hot, ...warm, ...cold]) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        results.push(item);
      }
      if (results.length >= (q.limit || 50)) break;
    }

    return results;
  }

  /**
   * Compact warm memory - demote old items to cold
   */
  async compact(warmTtlDays = 7): Promise<number> {
    const cutoff = Date.now() - warmTtlDays * 24 * 60 * 60 * 1000;
    const oldItems = await this.warm.query({ since: 0, limit: 1000 });
    let demoted = 0;

    for (const item of oldItems) {
      if (item.accessedAt < cutoff && item.importance !== 'high') {
        await this.cold.append(item);
        demoted++;
      }
    }

    return demoted;
  }
}
